import { schedule } from 'node-cron';
import type { Logger } from 'pino';
import type { DataApiClient } from './api/data.js';
import type { GammaClient } from './api/gamma.js';
import { collectMarkets, collectResolvedMarkets } from './collectors/markets.js';
import { collectPositions } from './collectors/positions.js';
import { collectTrades } from './collectors/trades.js';
import { collectWalletStats } from './collectors/wallets.js';
import type { DbClient } from './db/index.js';

export function startCron(
  gamma: GammaClient,
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
): void {
  const childLog = log.child({ module: 'cron' });

  function runSafe(name: string, fn: () => Promise<void>): void {
    fn().catch((err) => childLog.error({ name, err }, 'Collector failed'));
  }

  schedule('*/30 * * * *', () => runSafe('markets', () => collectMarkets(gamma, db, log)));
  schedule('*/15 * * * *', () => runSafe('trades', () => collectTrades(dataApi, db, log)));
  schedule('0 * * * *', () => runSafe('positions', () => collectPositions(gamma, db, log)));
  // Resolved market outcomes + wallet scoring every 6 hours
  schedule('0 */6 * * *', () =>
    runSafe('resolved-markets', () => collectResolvedMarkets(gamma, db, log)),
  );
  schedule('30 */6 * * *', () => runSafe('wallets', () => collectWalletStats(dataApi, db, log)));

  childLog.info('Cron scheduler started (markets/30min, trades/15min, positions/1h, wallets/6h)');

  runSafe('markets:init', () => collectMarkets(gamma, db, log));
  runSafe('trades:init', () => collectTrades(dataApi, db, log));
  runSafe('positions:init', () => collectPositions(gamma, db, log));
}
