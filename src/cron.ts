import type { Logger } from 'pino';
import type { DataApiClient } from './api/data.js';
import type { GammaClient } from './api/gamma.js';
import { detectCoordinatedEntries } from './analytics/anomaly-detector.js';
import {
  collectMarkets,
  collectResolvedMarkets,
  refreshOpenPositionMarkets,
} from './collectors/markets.js';
import { collectPositions } from './collectors/positions.js';
import { collectTrades } from './collectors/trades.js';
import {
  collectCoOccurrenceWallets,
  collectDuneWallets,
  collectMarketWinners,
  collectWalletStats,
  refreshStaleWallets,
} from './collectors/wallets.js';
import type { DbClient } from './db/index.js';
import { walletStats } from './db/schema.js';
import { vacuumDb } from './db/vacuum.js';

/**
 * Runs `fn` in a loop, waiting `max(5s, intervalMs - runtime)` between iterations.
 * Unlike node-cron's fixed-clock model, this never reports "missed executions" —
 * the next tick simply starts after the previous one finishes plus the remaining wait.
 * Errors are caught and logged so the loop never terminates on failure.
 */
async function runRepeating(
  name: string,
  intervalMs: number,
  fn: () => Promise<void>,
  log: Logger,
): Promise<void> {
  for (;;) {
    const start = Date.now();
    try {
      await fn();
    } catch (err) {
      log.error({ name, err }, 'Collector failed');
    }
    const elapsed = Date.now() - start;
    const wait = Math.max(5_000, intervalMs - elapsed);
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
}

export function startCron(
  gamma: GammaClient,
  dataApi: DataApiClient,
  db: DbClient,
  log: Logger,
  duneApiKey?: string | null,
  duneQueryIds: number[] = [],
): void {
  const childLog = log.child({ module: 'cron' });

  void (async () => {
    // Sequential init — run heavy collectors one at a time to avoid SQLite contention.
    childLog.info('Running initial data collection (sequential)');

    try {
      await collectMarkets(gamma, db, childLog);
    } catch (err) {
      childLog.error({ name: 'markets:init', err }, 'Collector failed');
    }

    try {
      await refreshOpenPositionMarkets(gamma, db, childLog);
    } catch (err) {
      childLog.error({ name: 'open-position-markets:init', err }, 'Collector failed');
    }

    try {
      await collectTrades(dataApi, db, childLog);
    } catch (err) {
      childLog.error({ name: 'trades:init', err }, 'Collector failed');
    }

    try {
      await collectPositions(dataApi, db, childLog);
    } catch (err) {
      childLog.error({ name: 'positions:init', err }, 'Collector failed');
    }

    // Bootstrap resolved markets + wallet scoring if no profitable wallets exist yet (fresh DB).
    const profitableCount = db
      .select()
      .from(walletStats)
      .all()
      .filter((w) => w.isProfitable).length;
    if (profitableCount === 0) {
      childLog.info('No profitable wallets — running initial resolved-markets + wallet scoring');
      try {
        await collectResolvedMarkets(gamma, db, childLog);
      } catch (err) {
        childLog.error({ name: 'resolved-markets:init', err }, 'Collector failed');
      }
      try {
        await collectWalletStats(dataApi, db, childLog);
      } catch (err) {
        childLog.error({ name: 'wallets:init', err }, 'Collector failed');
      }
    }

    childLog.info(
      'Initial collection complete — starting scheduled loops',
    );

    // Recurring loops — each runs independently; next tick starts after completion + wait.
    void runRepeating('markets', 30 * 60_000, () => collectMarkets(gamma, db, childLog), childLog);
    void runRepeating('open-position-markets', 30 * 60_000, () => refreshOpenPositionMarkets(gamma, db, childLog), childLog);
    void runRepeating('trades', 15 * 60_000, () => collectTrades(dataApi, db, childLog), childLog);
    void runRepeating('positions', 60 * 60_000, () => collectPositions(dataApi, db, childLog), childLog);
    void runRepeating('resolved-markets', 6 * 60 * 60_000, () => collectResolvedMarkets(gamma, db, childLog), childLog);
    void runRepeating('wallets', 6 * 60 * 60_000, () => collectWalletStats(dataApi, db, childLog), childLog);
    void runRepeating('wallets-refresh', 24 * 60 * 60_000, () => refreshStaleWallets(dataApi, db, childLog), childLog);
    void runRepeating('db-vacuum', 7 * 24 * 60 * 60_000, () => vacuumDb(db, childLog), childLog);

    // Market-winners: mine top traders from recently resolved markets every 6h.
    // Finds wallets invisible to volume-based scoring — verifies them through ground-truth wins.
    void runRepeating('market-winners', 6 * 60 * 60_000, () => collectMarketWinners(dataApi, db, childLog), childLog);

    // Co-occurrence: find wallets that trade alongside confirmed sharps in the same markets.
    // Grows in effectiveness as the trades table accumulates historical depth.
    void runRepeating('wallets-cooccurrence', 7 * 24 * 60 * 60_000, () => collectCoOccurrenceWallets(dataApi, db, childLog), childLog);

    // Anomaly detection: coordinated whale entries (2+ tracked whales, same outcome, within 4h).
    void runRepeating('anomalies-coordinated', 30 * 60_000, () => detectCoordinatedEntries(db, childLog), childLog);

    if (duneApiKey) {
      const ids = duneQueryIds.length > 0 ? duneQueryIds : undefined;
      void runRepeating('wallets-dune', 7 * 24 * 60 * 60_000, () => collectDuneWallets(duneApiKey, dataApi, db, childLog, ids), childLog);
      childLog.info({ queryIds: ids ?? [6979866] }, 'Dune weekly discovery scheduled');
    }

    childLog.info(
      'Cron scheduler started (markets/30min, open-markets/30min, trades/15min, positions/1h, wallets/6h, refresh/daily, vacuum/weekly)',
    );
  })();
}
