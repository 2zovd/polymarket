import type { Command } from 'commander';
import { desc, eq } from 'drizzle-orm';
import { createClobClient } from '../api/clob.js';
import { createDataApiClient } from '../api/data.js';
import { createDb } from '../db/index.js';
import { signals } from '../db/schema.js';
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
}
