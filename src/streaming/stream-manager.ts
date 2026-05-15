import { eq, or } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { ClobClientWrapper } from '../api/clob.js';
import type { DbClient } from '../db/index.js';
import { walletStats, watchedPositions } from '../db/schema.js';
import type { AppConfig } from '../types.js';
import { TradeEventHandler } from './event-handlers.js';
import { MarketStream } from './market-stream.js';

const WALLET_CACHE_TTL_MS = 5 * 60 * 1_000;
const METRICS_INTERVAL_MS = 5 * 60 * 1_000;
// Brief pause after WS connect before sending bulk subscribe message.
const SUBSCRIBE_DELAY_MS = 1_500;

export class StreamManager {
  private readonly stream: MarketStream;
  private readonly handler: TradeEventHandler;
  // In-place Set shared with TradeEventHandler — cleared and repopulated on refresh.
  private readonly trackedWallets = new Set<string>();
  private walletRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DbClient,
    private readonly clob: ClobClientWrapper,
    private readonly log: Logger,
    private readonly config: AppConfig,
    // Shared with monitor.ts module-level guard — prevents cross-path double-entry.
    private readonly sessionTokenGuard: Set<string>,
  ) {
    this.handler = new TradeEventHandler(
      this.trackedWallets,
      sessionTokenGuard,
      clob,
      db,
      log,
      config,
    );

    this.stream = new MarketStream(
      {
        onTrade: (e) =>
          this.handler.onTrade(e).catch((err) => log.error({ err }, 'ws:trade_handler_error')),
      },
      log,
    );
  }

  async start(): Promise<void> {
    await this.refreshTrackedWallets();
    const tokenIds = await this.loadInitialTokenIds();

    this.stream.start();

    if (tokenIds.length > 0) {
      setTimeout(() => this.stream.subscribe(tokenIds), SUBSCRIBE_DELAY_MS);
    }

    this.walletRefreshTimer = setInterval(
      () =>
        this.refreshTrackedWallets().catch((err) =>
          this.log.warn({ err }, 'ws:wallet_refresh_failed'),
        ),
      WALLET_CACHE_TTL_MS,
    );

    this.metricsTimer = setInterval(() => {
      this.log.info(
        { subscriptions: this.stream.subscriptionCount, trackedWallets: this.trackedWallets.size },
        'ws:metrics',
      );
    }, METRICS_INTERVAL_MS);

    this.log.info(
      { tokenIds: tokenIds.length, trackedWallets: this.trackedWallets.size },
      'WebSocket streaming started',
    );
  }

  addSubscription(tokenId: string): void {
    this.stream.subscribe([tokenId]);
  }

  stop(): void {
    if (this.walletRefreshTimer) {
      clearInterval(this.walletRefreshTimer);
      this.walletRefreshTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    this.stream.stop();
    this.log.info('WebSocket streaming stopped');
  }

  private async loadInitialTokenIds(): Promise<string[]> {
    const rows = await this.db
      .select({ tokenId: watchedPositions.tokenId })
      .from(watchedPositions)
      .innerJoin(walletStats, eq(watchedPositions.walletAddress, walletStats.walletAddress))
      .where(or(eq(walletStats.isSharp, true), eq(walletStats.isProfitable, true)))
      .all();

    const unique = [...new Set(rows.map((r) => r.tokenId))];
    this.log.info({ count: unique.length }, 'ws:initial_subscriptions_loaded');
    return unique.slice(0, this.config.wsMaxSubscriptions);
  }

  private async refreshTrackedWallets(): Promise<void> {
    const rows = await this.db
      .select({ walletAddress: walletStats.walletAddress })
      .from(walletStats)
      .where(or(eq(walletStats.isSharp, true), eq(walletStats.isProfitable, true)))
      .all();

    // Clear and repopulate in-place so TradeEventHandler sees the update via shared reference.
    this.trackedWallets.clear();
    for (const row of rows) this.trackedWallets.add(row.walletAddress);
    this.log.debug({ count: this.trackedWallets.size }, 'ws:tracked_wallets_refreshed');
  }
}
