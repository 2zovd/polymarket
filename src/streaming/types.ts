// WebSocket event types for the Polymarket Market channel.
// wss://ws-subscriptions-clob.polymarket.com/ws/market

export interface MarketTradeEvent {
  event_type: 'trade';
  id: string;
  maker_address: string;
  asset_id: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  condition_id: string;
}

export interface PriceChangeItem {
  asset_id: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  hash: string;
  best_bid: string;
  best_ask: string;
}

export interface PriceChangeEvent {
  event_type: 'price_change';
  market: string;
  price_changes: PriceChangeItem[];
  timestamp: string;
}

export interface BookLevel {
  price: string;
  size: string;
}

export interface BookEvent {
  event_type: 'book';
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: BookLevel[];
  asks: BookLevel[];
  tick_size?: string;
  last_trade_price?: string;
}

export interface MarketResolvedEvent {
  event_type: 'market_resolved';
  condition_id: string;
  market_slug?: string;
}

export interface SubscribedEvent {
  event_type: 'subscribed' | 'unsubscribed';
  channel?: string;
}

export type WsMarketEvent =
  | MarketTradeEvent
  | PriceChangeEvent
  | BookEvent
  | MarketResolvedEvent
  | SubscribedEvent;

export function isTradeEvent(e: WsMarketEvent): e is MarketTradeEvent {
  return e.event_type === 'trade';
}

export function isBookEvent(e: WsMarketEvent): e is BookEvent {
  return e.event_type === 'book';
}

export function isPriceEvent(e: WsMarketEvent): e is PriceChangeEvent {
  return e.event_type === 'price_change';
}
