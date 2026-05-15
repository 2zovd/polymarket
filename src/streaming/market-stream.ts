import type { Logger } from 'pino';
import type { BookEvent, LastTradePriceEvent, MarketTradeEvent, WsMarketEvent } from './types.js';
import { isBookEvent, isPriceEvent, isTradeEvent } from './types.js';
import { WsClient } from './ws-client.js';

const MARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
// Polymarket recommends keeping subscription messages small; 100 IDs ≈ 8KB per message.
const SUBSCRIBE_BATCH_SIZE = 100;

export interface MarketStreamHandlers {
  onTrade: (event: MarketTradeEvent) => void;
  // Receives every trade (all wallets, both sides) for broad surveillance.
  onAllTrade?: (event: MarketTradeEvent) => void;
  onBook?: (event: BookEvent) => void;
  onPriceChange?: (event: LastTradePriceEvent) => void;
}

export class MarketStream {
  private readonly client: WsClient;
  private readonly subscriptions = new Set<string>();

  constructor(
    private readonly handlers: MarketStreamHandlers,
    private readonly log: Logger,
  ) {
    this.client = new WsClient(
      MARKET_WS_URL,
      {
        onEvents: (events) => this.handleEvents(events),
        onConnected: () => this.resubscribeAll(),
      },
      log,
    );
  }

  start(): void {
    this.client.connect();
  }

  stop(): void {
    this.client.disconnect();
  }

  subscribe(tokenIds: string[]): void {
    const fresh = tokenIds.filter((id) => !this.subscriptions.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) this.subscriptions.add(id);
    this.sendInBatches(fresh, false);
    this.log.debug({ added: fresh.length, total: this.subscriptions.size }, 'ws:subscribed');
  }

  unsubscribe(tokenIds: string[]): void {
    const existing = tokenIds.filter((id) => this.subscriptions.has(id));
    if (existing.length === 0) return;
    for (const id of existing) this.subscriptions.delete(id);
    this.sendInBatches(existing, true);
    this.log.debug({ removed: existing.length, total: this.subscriptions.size }, 'ws:unsubscribed');
  }

  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  private resubscribeAll(): void {
    const ids = [...this.subscriptions];
    if (ids.length === 0) return;
    this.sendInBatches(ids, false);
    this.log.info({ count: ids.length }, 'ws:resubscribed_after_reconnect');
  }

  private sendInBatches(ids: string[], remove: boolean): void {
    for (let i = 0; i < ids.length; i += SUBSCRIBE_BATCH_SIZE) {
      const batch = ids.slice(i, i + SUBSCRIBE_BATCH_SIZE);
      this.client.send(
        JSON.stringify({ assets_ids: batch, type: 'market', ...(remove ? { remove: true } : {}) }),
      );
    }
  }

  private handleEvents(events: WsMarketEvent[]): void {
    for (const event of events) {
      if (isTradeEvent(event)) {
        this.handlers.onTrade(event);
        this.handlers.onAllTrade?.(event);
      } else if (isBookEvent(event)) {
        this.handlers.onBook?.(event);
      } else if (isPriceEvent(event)) {
        this.handlers.onPriceChange?.(event);
      }
    }
  }
}
