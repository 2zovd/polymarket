import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { ClobClientWrapper } from '../api/clob.js';
import type { DbClient } from '../db/index.js';
import { liveEvents, openPositions } from '../db/schema.js';
import { executeSignal } from '../engine/executor.js';
import { type WhalePosition, generateSignal } from '../engine/signal.js';
import type { AppConfig } from '../types.js';
import type { MarketTradeEvent } from './types.js';

export class TradeEventHandler {
  constructor(
    // Shared reference — StreamManager updates this Set in-place on wallet cache refresh.
    private readonly trackedWallets: Set<string>,
    // Shared with monitor.ts — prevents double-entry across WS and polling paths.
    private readonly sessionTokenGuard: Set<string>,
    private readonly clob: ClobClientWrapper,
    private readonly db: DbClient,
    private readonly log: Logger,
    private readonly config: AppConfig,
  ) {}

  async onTrade(event: MarketTradeEvent): Promise<void> {
    // Only act on BUY side — sells are not entry signals.
    if (event.side !== 'BUY') return;

    if (!this.trackedWallets.has(event.maker_address)) return;

    const price = Number.parseFloat(event.price);
    const size = Number.parseFloat(event.size);

    if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return;

    const tokenId = event.asset_id;
    const usdcSize = size * price;

    // Cross-path deduplication: if the polling cycle already reserved this token
    // (or WS already fired for it), skip immediately without touching the DB.
    if (this.sessionTokenGuard.has(tokenId)) return;
    this.sessionTokenGuard.add(tokenId);

    const childLog = this.log.child({
      module: 'ws-handler',
      wallet: event.maker_address.slice(0, 10),
    });

    childLog.info(
      {
        tokenId: tokenId.slice(0, 12),
        conditionId: event.condition_id.slice(0, 12),
        price,
        usdcSize: usdcSize.toFixed(2),
        outcome: event.outcome,
      },
      'Live whale trade detected',
    );

    const openRows = await this.db
      .select({ tokenId: openPositions.tokenId })
      .from(openPositions)
      .where(eq(openPositions.status, 'open'))
      .all();

    const openTokenIds = new Set(openRows.map((r) => r.tokenId));

    if (openTokenIds.size >= this.config.maxOpenPositions) {
      childLog.info({ max: this.config.maxOpenPositions }, 'ws:max_positions_reached — skipping');
      this.sessionTokenGuard.delete(tokenId);
      return;
    }

    const position: WhalePosition = {
      walletAddress: event.maker_address,
      tokenId,
      conditionId: event.condition_id,
      outcome: event.outcome,
      size,
      avgPrice: price,
      initialValue: usdcSize,
    };

    const signal = await generateSignal(position, this.clob, this.db, this.config, openTokenIds);

    if (signal.status !== 'ready') {
      const reason = signal.skipReason ?? 'unknown';
      childLog.info(
        { tokenId: tokenId.slice(0, 12), reason, price, source: 'ws' },
        'ws:signal_skipped',
      );
      this.sessionTokenGuard.delete(tokenId);
      // Record skipped detection for observability.
      await this.recordLiveEvent('whale_buy', event.condition_id, tokenId, usdcSize, {
        wallet: event.maker_address,
        price,
        size,
        usdcSize,
        outcome: event.outcome,
        signalStatus: 'skipped',
        skipReason: reason,
      });
      return;
    }

    openTokenIds.add(tokenId);

    const result = await executeSignal(signal, this.clob, this.db, childLog, this.config);

    if (result.status !== 'executed' && result.status !== 'dry-run') {
      // Order failed — release guard so the polling cycle can retry.
      this.sessionTokenGuard.delete(tokenId);
      openTokenIds.delete(tokenId);
    }

    await this.recordLiveEvent('whale_buy', event.condition_id, tokenId, usdcSize, {
      wallet: event.maker_address,
      price,
      size,
      usdcSize,
      outcome: event.outcome,
      signalStatus: signal.status,
      executionStatus: result.status,
      orderId: result.orderId,
    });
  }

  private async recordLiveEvent(
    type: string,
    marketId: string,
    tokenId: string,
    usdcSize: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    const severity = usdcSize >= 10_000 ? 'high' : usdcSize >= 1_000 ? 'medium' : 'low';
    try {
      await this.db.insert(liveEvents).values({
        type,
        marketId,
        tokenId,
        severity,
        data: JSON.stringify(data),
        detectedAt: Date.now(),
      });
    } catch (err) {
      this.log.warn({ err }, 'ws:live_event_insert_failed');
    }
  }
}
