import type { Logger } from 'pino';
import type { ClobClientWrapper } from '../api/clob.js';
import type { DbClient } from '../db/index.js';
import { openPositions, signals } from '../db/schema.js';
import { sendSignalAlert } from '../lib/telegram.js';
import type { AppConfig } from '../types.js';
import type { Signal } from './signal.js';

export interface ExecutionResult {
  orderId: string | null;
  executedSize: number;
  status: 'executed' | 'dry-run' | 'skipped' | 'error';
  error?: string;
}

async function insertSignal(
  db: DbClient,
  signal: Signal,
  result: Pick<ExecutionResult, 'executedSize' | 'orderId' | 'status' | 'error'>,
  config: AppConfig,
  now: string,
): Promise<number> {
  const rows = await db
    .insert(signals)
    .values({
      walletAddress: signal.walletAddress,
      conditionId: signal.conditionId,
      tokenId: signal.tokenId,
      outcome: signal.outcome,
      whaleAvgPrice: signal.whaleAvgPrice,
      currentAsk: signal.currentAsk,
      edge: signal.edge,
      kellySize: signal.kellySize,
      executedSize: result.executedSize,
      orderId: result.orderId ?? null,
      status: result.status,
      skipReason: signal.skipReason ?? result.error ?? null,
      dryRun: config.dryRun,
      createdAt: now,
    })
    .returning({ id: signals.id });
  if (!rows[0]) throw new Error('Signal insert returned no rows');
  return rows[0].id;
}

export async function executeSignal(
  signal: Signal,
  clob: ClobClientWrapper,
  db: DbClient,
  log: Logger,
  config: AppConfig,
): Promise<ExecutionResult> {
  const now = new Date().toISOString();
  const childLog = log.child({ module: 'executor', wallet: signal.walletAddress.slice(0, 10) });

  if (signal.status === 'skipped') {
    await insertSignal(
      db,
      signal,
      { executedSize: 0, orderId: null, status: 'skipped' },
      config,
      now,
    );
    return { orderId: null, executedSize: 0, status: 'skipped' };
  }

  childLog.info(
    {
      conditionId: signal.conditionId,
      outcome: signal.outcome,
      whaleAvgPrice: signal.whaleAvgPrice,
      currentAsk: signal.currentAsk,
      edge: signal.edge.toFixed(4),
      kellySize: signal.kellySize.toFixed(2),
      dryRun: config.dryRun,
    },
    'Executing copy trade signal',
  );

  let result: ExecutionResult;

  try {
    const { orderId, dryRun } = await clob.placeLimitOrder({
      tokenId: signal.tokenId,
      side: 'BUY',
      price: signal.currentAsk,
      size: signal.kellySize,
    });

    result = {
      orderId: dryRun ? null : orderId,
      executedSize: dryRun ? 0 : signal.kellySize,
      status: dryRun ? 'dry-run' : 'executed',
    };

    childLog.info({ orderId, dryRun, size: signal.kellySize }, 'Order placed');
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    childLog.error({ err }, 'Order placement failed');
    result = { orderId: null, executedSize: 0, status: 'error', error };
  }

  const signalId = await insertSignal(db, signal, result, config, now);

  if (result.status === 'executed' || result.status === 'dry-run') {
    // Use kellySize for dry-run (simulated exposure), executedSize for live
    const trackedSize = result.status === 'executed' ? result.executedSize : signal.kellySize;
    await db.insert(openPositions).values({
      signalId,
      tokenId: signal.tokenId,
      conditionId: signal.conditionId,
      outcome: signal.outcome,
      size: trackedSize,
      entryPrice: signal.currentAsk,
      entryAt: now,
      isDryRun: config.dryRun,
      status: 'open',
    });

    await sendSignalAlert(signal, result, config);
  }

  return result;
}
