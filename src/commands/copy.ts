import type { Command } from 'commander';
import { desc, eq, inArray } from 'drizzle-orm';
import { createClobClient } from '../api/clob.js';
import { createDataApiClient } from '../api/data.js';
import { createDb } from '../db/index.js';
import { openPositions, signals } from '../db/schema.js';
import { runMonitorCycle, startMonitor } from '../engine/monitor.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

function print(s = ''): void {
  process.stdout.write(`${s}\n`);
}

export function registerCopyCommand(program: Command): void {
  const copy = program
    .command('copy')
    .description('Copy trading engine — monitor and execute whale signals');

  copy
    .command('start')
    .description('Start the monitor loop (blocks the process)')
    .option('--once', 'Run a single monitor cycle and exit (useful for testing)')
    .action(async (opts: { once?: boolean }) => {
      const db = createDb(config.databasePath);
      const dataApi = createDataApiClient(config, logger);
      const clob = createClobClient(config, logger);

      if (opts.once) {
        logger.info('Running single monitor cycle');
        await runMonitorCycle(dataApi, clob, db, logger, config);
        logger.info('Single cycle complete');
        return;
      }

      await startMonitor(dataApi, clob, db, logger, config);
    });

  copy
    .command('status')
    .description('Show recent copy trading signals')
    .option('-n, --limit <n>', 'Number of signals to show', '20')
    .option('--live', 'Show only executed signals (status = executed)')
    .action(async (opts: { limit: string; live?: boolean }) => {
      const db = createDb(config.databasePath);
      const limit = Number.parseInt(opts.limit, 10);

      const where = opts.live ? eq(signals.status, 'executed') : undefined;

      const rows = await db
        .select()
        .from(signals)
        .where(where)
        .orderBy(desc(signals.createdAt))
        .limit(limit)
        .all();

      if (rows.length === 0) {
        print(
          opts.live
            ? 'No executed signals yet.'
            : 'No signals yet. Run: pnpm dev copy start --once',
        );
        return;
      }

      print(
        `\n${'Wallet'.padEnd(12)} ${'Outcome'.padEnd(14)} ${'WhaleP'.padStart(7)} ${'Ask'.padStart(6)} ${'Edge'.padStart(6)} ${'Kelly$'.padStart(7)} ${'Exec$'.padStart(6)} ${'Status'.padEnd(9)} ${'Created'.padEnd(24)}`,
      );
      print('─'.repeat(102));

      for (const r of rows) {
        const wallet = r.walletAddress.slice(0, 10);
        const outcome = r.outcome.slice(0, 14).padEnd(14);
        const whaleP = r.whaleAvgPrice.toFixed(3).padStart(7);
        const ask = r.currentAsk.toFixed(3).padStart(6);
        const edge = r.edge.toFixed(3).padStart(6);
        const kelly = r.kellySize.toFixed(2).padStart(7);
        const exec = r.executedSize.toFixed(2).padStart(6);
        const status = r.status.padEnd(9);
        print(
          `${wallet.padEnd(12)} ${outcome} ${whaleP} ${ask} ${edge} ${kelly} ${exec} ${status} ${r.createdAt}`,
        );
        if (r.skipReason) {
          print(`${''.padEnd(12)}  skip: ${r.skipReason}`);
        }
      }

      const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(byStatus)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      print(`\n${rows.length} signals — ${summary}`);
    });

  copy
    .command('positions')
    .description('Show tracked open positions and resolved P&L')
    .option('--history', 'Show resolved positions (won/lost) instead of open ones')
    .action(async (opts: { history?: boolean }) => {
      const db = createDb(config.databasePath);

      const statusFilter = opts.history
        ? inArray(openPositions.status, ['won', 'lost'])
        : eq(openPositions.status, 'open');

      const rows = await db
        .select()
        .from(openPositions)
        .where(statusFilter)
        .orderBy(desc(openPositions.entryAt))
        .all();

      if (rows.length === 0) {
        print(opts.history ? 'No resolved positions yet.' : 'No open positions.');
        return;
      }

      const header = opts.history
        ? `\n${'Outcome'.padEnd(16)} ${'Size$'.padStart(7)} ${'Entry'.padStart(6)} ${'Payout$'.padStart(8)} ${'P&L$'.padStart(7)} ${'Status'.padEnd(6)} ${'Mode'.padEnd(8)} ${'Resolved'.padEnd(24)}`
        : `\n${'Outcome'.padEnd(16)} ${'Size$'.padStart(7)} ${'Entry'.padStart(6)} ${'Shares'.padStart(8)} ${'Mode'.padEnd(8)} ${'Entered'.padEnd(24)}`;

      print(header);
      print('─'.repeat(opts.history ? 90 : 80));

      let totalExposure = 0;
      let totalPnl = 0;

      for (const r of rows) {
        const outcome = r.outcome.slice(0, 16).padEnd(16);
        const size = r.size.toFixed(2).padStart(7);
        const entry = r.entryPrice.toFixed(3).padStart(6);
        const mode = (r.isDryRun ? 'dry-run' : 'live').padEnd(8);
        totalExposure += r.size;

        if (opts.history) {
          const payout = (r.payout ?? 0).toFixed(2).padStart(8);
          const pnl = r.pnl !== null ? r.pnl.toFixed(2) : 'n/a';
          const pnlStr = (r.pnl !== null && r.pnl >= 0 ? `+${pnl}` : pnl).padStart(7);
          if (r.pnl !== null) totalPnl += r.pnl;
          print(
            `${outcome} ${size} ${entry} ${payout} ${pnlStr} ${r.status.padEnd(6)} ${mode} ${r.resolvedAt ?? ''}`,
          );
        } else {
          const shares = (r.size / r.entryPrice).toFixed(1).padStart(8);
          print(`${outcome} ${size} ${entry} ${shares} ${mode} ${r.entryAt}`);
        }
      }

      print('─'.repeat(opts.history ? 90 : 80));
      if (opts.history) {
        print(
          `${rows.length} positions | Total P&L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDC`,
        );
      } else {
        print(`${rows.length} open positions | Total exposure: $${totalExposure.toFixed(2)} USDC`);
      }
    });
}
