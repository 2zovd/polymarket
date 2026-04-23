// Core Polymarket domain types.
// These mirror shapes returned by the CLOB and Gamma APIs after Zod validation.

// ─── Market ──────────────────────────────────────────────────────────────────

export type MarketStatus = 'active' | 'closed' | 'resolved' | 'cancelled';

export interface Market {
  conditionId: string;
  questionId: string;
  question: string;
  description: string;
  slug: string;
  status: MarketStatus;
  endDateIso: string;
  tokens: Token[];
  /** Volume in USDC (full units) */
  volumeNum: number;
  liquidityNum: number;
  /** Maker fee rate, e.g. 0.001 = 0.1% */
  makerBaseFee: number;
  takerBaseFee: number;
  active: boolean;
  closed: boolean;
}

export interface Token {
  tokenId: string;
  outcome: string;
  /** Best ask price, 0–1 */
  price: number;
  winner: boolean;
}

// ─── Orderbook ───────────────────────────────────────────────────────────────

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  market: string;
  assetId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: string;
  hash: string;
}

// ─── Orders & Trades ─────────────────────────────────────────────────────────

export type Side = 'BUY' | 'SELL';
export type OrderType = 'GTC' | 'FOK' | 'GTD';
export type OrderStatus = 'LIVE' | 'MATCHED' | 'DELAYED' | 'CANCELLED' | 'UNMATCHED' | 'RETRYING';

export interface Order {
  id: string;
  owner: string;
  asset_id: string;
  side: Side;
  status: OrderStatus;
  type: OrderType;
  /** Price per share, 0–1 */
  price: string;
  size: string;
  sizeMatched: string;
  sizeRemaining: string;
  sizeCancelled: string;
  createdAt: string;
  updatedAt: string;
  expirationTimestamp: number;
  makerAddress: string;
}

export interface MakerOrder {
  order_id: string;
  maker_address: string;
  matched_amount: string;
  fee: string;
  price: string;
  asset_id: string;
  outcome: string;
}

export interface Trade {
  id: string;
  taker_order_id: string;
  market: string;
  asset_id: string;
  side: Side;
  size: string;
  fee_rate_bps: string;
  price: string;
  status: string;
  match_time: string;
  outcome: string;
  owner: string;
  maker_orders: MakerOrder[];
  transaction_hash: string;
  trader_side: Side;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface AppConfig {
  clobApiUrl: string;
  gammaApiUrl: string;
  subgraphUrl: string;
  privateKey: `0x${string}`;
  chainId: number;
  polymarketProxyAddress: `0x${string}` | null;
  dryRun: boolean;
  maxOrderSizeUsdc: number;
  logLevel: string;
  logPretty: boolean;
  polygonRpcUrl: string;
}
