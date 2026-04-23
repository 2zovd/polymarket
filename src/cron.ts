import { schedule } from 'node-cron';
import type { Logger } from 'pino';
import type { GammaClient } from './api/gamma.js';
import { collectMarkets } from './collectors/markets.js';
import { collectPositions } from './collectors/positions.js';
import { collectTrades } from './collectors/trades.js';
import type { DbClient } from './db/index.js';
import type { SubgraphClient } from './lib/subgraph.js';

export function startCron(
  gamma: GammaClient,
  subgraph: SubgraphClient,
  db: DbClient,
  log: Logger,
): void {
  const childLog = log.child({ module: 'cron' });

  function runSafe(name: string, fn: () => Promise<void>): void {
    fn().catch((err) => childLog.error({ name, err }, 'Collector failed'));
  }

  // Markets — every 30 min
  schedule('*/30 * * * *', () => runSafe('markets', () => collectMarkets(gamma, db, log)));

  // Trades — every 15 min
  schedule('*/15 * * * *', () => runSafe('trades', () => collectTrades(subgraph, db, log)));

  // Positions — every hour
  schedule('0 * * * *', () => runSafe('positions', () => collectPositions(gamma, db, log)));

  childLog.info('Cron scheduler started (markets/30min, trades/15min, positions/1h)');

  // Run all collectors immediately on startup to populate DB without waiting for first tick.
  runSafe('markets:init', () => collectMarkets(gamma, db, log));
  runSafe('trades:init', () => collectTrades(subgraph, db, log));
  runSafe('positions:init', () => collectPositions(gamma, db, log));
}
