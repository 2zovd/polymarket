import { schedule } from 'node-cron';
import type { Logger } from 'pino';
import type { DataApiClient } from './api/data.js';
import type { GammaClient } from './api/gamma.js';
import { collectMarkets, collectResolvedMarkets } from './collectors/markets.js';
import { collectPositions } from './collectors/positions.js';
import { collectTrades } from './collectors/trades.js';
import {
  collectDuneWallets,
  collectWalletStats,
  refreshStaleWallets,
} from './collectors/wallets.js';
import type { DbClient } from './db/index.js';

export function startCron(
  gamma: GammaClient,
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
  duneApiKey?: string | null,
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
  // Daily at 02:00 — re-score wallets not updated in 7+ days (keeps Dune-seeded wallets fresh)
  schedule('0 2 * * *', () =>
    runSafe('wallets-refresh', () => refreshStaleWallets(dataApi, db, log)),
  );
  // Weekly on Sunday at 03:00 — pull new top wallets from Dune and seed them
  if (duneApiKey) {
    schedule('0 3 * * 0', () =>
      runSafe('wallets-dune', () => collectDuneWallets(duneApiKey, dataApi, db, log)),
    );
    childLog.info('Dune weekly discovery scheduled (Sun 03:00)');
  }

  childLog.info(
    'Cron scheduler started (markets/30min, trades/15min, positions/1h, wallets/6h, refresh/daily)',
  );

  runSafe('markets:init', () => collectMarkets(gamma, db, log));
  runSafe('trades:init', () => collectTrades(dataApi, db, log));
  runSafe('positions:init', () => collectPositions(gamma, db, log));
}
