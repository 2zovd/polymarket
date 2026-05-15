import type { Logger } from 'pino';
import type { MarketTradeEvent, WsMarketEvent } from './types.js';
import { isTradeEvent } from './types.js';
import { WsClient } from './ws-client.js';

const MARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

export interface MarketStreamHandlers {
  onTrade: (event: MarketTradeEvent) => void;
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
    this.client.send(JSON.stringify({ assets_ids: fresh, type: 'market' }));
    this.log.debug({ added: fresh.length, total: this.subscriptions.size }, 'ws:subscribed');
  }

  unsubscribe(tokenIds: string[]): void {
    const existing = tokenIds.filter((id) => this.subscriptions.has(id));
    if (existing.length === 0) return;
    for (const id of existing) this.subscriptions.delete(id);
    this.client.send(JSON.stringify({ assets_ids: existing, type: 'market', remove: true }));
    this.log.debug({ removed: existing.length, total: this.subscriptions.size }, 'ws:unsubscribed');
  }

  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  private resubscribeAll(): void {
    const ids = [...this.subscriptions];
    if (ids.length === 0) return;
    this.client.send(JSON.stringify({ assets_ids: ids, type: 'market' }));
    this.log.info({ count: ids.length }, 'ws:resubscribed_after_reconnect');
  }

  private handleEvents(events: WsMarketEvent[]): void {
    for (const event of events) {
      if (isTradeEvent(event)) {
        this.handlers.onTrade(event);
      }
    }
  }
}
