import type { Logger } from 'pino';
import type { BookEvent, MarketTradeEvent, PriceChangeEvent, WsMarketEvent } from './types.js';
import { isBookEvent, isPriceEvent, isTradeEvent } from './types.js';
import { WsClient } from './ws-client.js';

const MARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

export interface MarketStreamHandlers {
  onTrade: (event: MarketTradeEvent) => void;
  // Receives every trade (all wallets, both sides) for broad surveillance.
  onAllTrade?: (event: MarketTradeEvent) => void;
  onBook?: (event: BookEvent) => void;
  onPriceChange?: (event: PriceChangeEvent) => void;
}

export class MarketStream {
  private readonly client: WsClient;
  private readonly subscriptions = new Set<string>();
  // True after the initial subscription message has been sent for this connection.
  // The server rejects any second subscription message per session with "INVALID OPERATION".
  // New tokens added via subscribe() during a session are queued into the Set and will be
  // included in the next resubscribeAll() call after reconnect.
  private subscriptionSent = false;

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
    if (!this.subscriptionSent) {
      this.sendSubscription([...this.subscriptions]);
      this.subscriptionSent = true;
    }
    this.log.debug({ added: fresh.length, total: this.subscriptions.size }, 'ws:subscribed');
  }

  unsubscribe(tokenIds: string[]): void {
    const existing = tokenIds.filter((id) => this.subscriptions.has(id));
    if (existing.length === 0) return;
    for (const id of existing) this.subscriptions.delete(id);
    this.log.debug({ removed: existing.length, total: this.subscriptions.size }, 'ws:unsubscribed');
  }

  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  private resubscribeAll(): void {
    const ids = [...this.subscriptions];
    this.subscriptionSent = false;
    if (ids.length === 0) return;
    this.sendSubscription(ids);
    this.subscriptionSent = true;
    this.log.info({ count: ids.length }, 'ws:resubscribed_after_reconnect');
  }

  private sendSubscription(ids: string[]): void {
    this.client.send(JSON.stringify({ assets_ids: ids, type: 'market' }));
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
