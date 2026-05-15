import type { Logger } from 'pino';
import type { DbClient } from '../db/index.js';
import { liveEvents } from '../db/schema.js';
import type { BookEvent, MarketTradeEvent, PriceChangeEvent } from './types.js';

// Price must move at least this many percentage points within the window to be a spike.
const PRICE_SPIKE_MIN_CHANGE = 0.07;
// Sliding window for price spike detection (ms).
const PRICE_SPIKE_WINDOW_MS = 5 * 60 * 1_000;
// Don't re-fire a price spike alert for the same token within this window (ms).
const PRICE_SPIKE_DEDUP_MS = 5 * 60 * 1_000;
// Minimum elapsed time between the oldest and newest price point to qualify as a spike.
// Guards against startup bursts where the server replays recent trades in rapid succession.
const PRICE_SPIKE_MIN_WINDOW_MS = 30_000;
// Total ask-side USDC across top levels below which we call a book "thin".
const ORDERBOOK_THIN_THRESHOLD_USDC = 1_000;
// Don't re-fire a thin-book alert for the same token within this window (ms).
const ORDERBOOK_THIN_DEDUP_MS = 10 * 60 * 1_000;

interface PricePoint {
  price: number;
  ts: number;
}

export class WsAnomalyDetector {
  // tokenId → sorted price history within PRICE_SPIKE_WINDOW_MS
  private readonly priceHistory = new Map<string, PricePoint[]>();
  // tokenId → last time a spike alert was fired
  private readonly lastSpikeFired = new Map<string, number>();
  // tokenId → last time a thin-book alert was fired
  private readonly lastThinFired = new Map<string, number>();
  // tokenId → conditionId (populated by StreamManager, updated on new subscriptions)
  private readonly tokenConditionMap: Map<string, string>;

  constructor(
    tokenConditionMap: Map<string, string>,
    private readonly largeTradeThresholdUsdc: number,
    private readonly db: DbClient,
    private readonly log: Logger,
  ) {
    this.tokenConditionMap = tokenConditionMap;
  }

  onTrade(event: MarketTradeEvent): void {
    const price = Number.parseFloat(event.price);
    const size = Number.parseFloat(event.size);
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return;

    const usdcSize = size * price;
    if (usdcSize < this.largeTradeThresholdUsdc) return;

    const conditionId = this.tokenConditionMap.get(event.asset_id) ?? event.condition_id;
    const severity = usdcSize >= 50_000 ? 'high' : usdcSize >= 15_000 ? 'medium' : 'low';

    this.log.info(
      {
        tokenId: event.asset_id.slice(0, 12),
        side: event.side,
        usdcSize: usdcSize.toFixed(0),
        price,
        severity,
      },
      'ws:large_trade_detected',
    );

    this.insert('large_trade', conditionId, event.asset_id, severity, {
      side: event.side,
      price,
      size,
      usdcSize,
      outcome: event.outcome,
      wallet: event.maker_address,
    });
  }

  onPriceChange(event: PriceChangeEvent): void {
    const now = Date.now();
    // event.market is the hex condition_id for all tokens in this batch.
    const conditionId = event.market;
    for (const item of event.price_changes) {
      this.processPrice(item.asset_id, item.price, conditionId, now);
    }
  }

  private processPrice(tokenId: string, rawPrice: string, conditionId: string, now: number): void {
    const price = Number.parseFloat(rawPrice);
    if (!Number.isFinite(price) || price <= 0) return;

    const cutoff = now - PRICE_SPIKE_WINDOW_MS;
    const history = this.priceHistory.get(tokenId) ?? [];
    history.push({ price, ts: now });
    const fresh = history.filter((p) => p.ts >= cutoff);
    this.priceHistory.set(tokenId, fresh);

    if (fresh.length < 2) return;

    // fresh.length >= 2 guarantees [0] exists; non-null assertion is safe here.
    // biome-ignore lint/style/noNonNullAssertion: guaranteed by length check above
    const windowStart = fresh[0]!;
    if (now - windowStart.ts < PRICE_SPIKE_MIN_WINDOW_MS) return;
    const change = Math.abs(price - windowStart.price);
    if (change < PRICE_SPIKE_MIN_CHANGE) return;

    const lastFired = this.lastSpikeFired.get(tokenId) ?? 0;
    if (now - lastFired < PRICE_SPIKE_DEDUP_MS) return;
    this.lastSpikeFired.set(tokenId, now);

    const severity = change >= 0.2 ? 'high' : change >= 0.12 ? 'medium' : 'low';
    const direction = price > windowStart.price ? 'up' : 'down';

    this.log.info(
      {
        tokenId: tokenId.slice(0, 12),
        from: windowStart.price.toFixed(3),
        to: price.toFixed(3),
        changePp: (change * 100).toFixed(1),
        direction,
        severity,
      },
      'ws:price_spike_detected',
    );

    this.insert('price_spike', conditionId, tokenId, severity, {
      priceFrom: windowStart.price,
      priceTo: price,
      changePp: change * 100,
      direction,
      windowMs: now - windowStart.ts,
    });
  }

  onBook(event: BookEvent): void {
    const tokenId = event.asset_id;
    const now = Date.now();

    // Sum USDC across top-10 ask levels (price × size).
    const totalAskUsdc = event.asks.slice(0, 10).reduce((acc, level) => {
      const p = Number.parseFloat(level.price);
      const s = Number.parseFloat(level.size);
      return acc + (Number.isFinite(p) && Number.isFinite(s) ? p * s : 0);
    }, 0);

    if (totalAskUsdc >= ORDERBOOK_THIN_THRESHOLD_USDC) return;

    // Dedup: only fire if we haven't alerted recently.
    const lastFired = this.lastThinFired.get(tokenId) ?? 0;
    if (now - lastFired < ORDERBOOK_THIN_DEDUP_MS) return;
    this.lastThinFired.set(tokenId, now);

    // event.market is the hex condition_id for this token.
    const conditionId = event.market ?? this.tokenConditionMap.get(tokenId) ?? tokenId;
    const severity = totalAskUsdc < 200 ? 'high' : totalAskUsdc < 500 ? 'medium' : 'low';

    this.log.info(
      {
        tokenId: tokenId.slice(0, 12),
        totalAskUsdc: totalAskUsdc.toFixed(0),
        askLevels: event.asks.length,
        severity,
      },
      'ws:orderbook_thin_detected',
    );

    this.insert('orderbook_thin', conditionId, tokenId, severity, {
      totalAskUsdc,
      askLevels: event.asks.length,
      totalBidUsdc: event.bids.slice(0, 10).reduce((acc, level) => {
        const p = Number.parseFloat(level.price);
        const s = Number.parseFloat(level.size);
        return acc + (Number.isFinite(p) && Number.isFinite(s) ? p * s : 0);
      }, 0),
    });
  }

  private insert(
    type: string,
    marketId: string,
    tokenId: string,
    severity: string,
    data: Record<string, unknown>,
  ): void {
    try {
      this.db
        .insert(liveEvents)
        .values({
          type,
          marketId,
          tokenId,
          severity,
          data: JSON.stringify(data),
          detectedAt: Date.now(),
        })
        .run();
    } catch (err) {
      this.log.warn({ err }, 'ws:anomaly_insert_failed');
    }
  }
}
