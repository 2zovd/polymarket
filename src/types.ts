// Core Polymarket domain types.
// These mirror shapes returned by the CLOB and Gamma APIs after Zod validation.

// ─── Market ──────────────────────────────────────────────────────────────────

export type MarketStatus = 'active' | 'closed' | 'resolved' | 'cancelled';

// Gamma API market shape — matches actual response from /markets endpoint.
// Field names are as returned by the API (some quirks: questionID vs questionId).
export interface Market {
  conditionId: string;
  // Gamma returns questionID (capital ID); questionId alias kept for compatibility
  questionID?: string;
  questionId?: string;
  question: string;
  description?: string;
  slug: string;
  // Gamma does not return a status string — derive from active/closed flags
  status?: MarketStatus;
  // Gamma returns either endDateIso ("2026-07-31") or endDate (ISO datetime) or both
  endDateIso?: string;
  endDate?: string;
  // Tokens are returned inline by /markets but shape varies; parsed separately
  tokens?: Token[];
  clobTokenIds?: string; // JSON-encoded array of token IDs
  // JSON string arrays: outcomePrices=["1","0"] means outcome 0 won; ["0","1"] means outcome 1 won
  outcomePrices?: string;
  outcomes?: string;
  /** Volume in USDC (full units) */
  volumeNum: number;
  liquidityNum: number;
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

export interface ClobCreds {
  key: string;
  secret: string;
  passphrase: string;
}

export interface AppConfig {
  clobApiUrl: string;
  gammaApiUrl: string;
  dataApiUrl: string;
  subgraphUrl: string;
  databasePath: string;
  privateKey: `0x${string}`;
  chainId: number;
  polymarketProxyAddress: `0x${string}` | null;
  /** L2 API credentials — null until derive-keys is run */
  clobCreds: ClobCreds | null;
  dryRun: boolean;
  maxOrderSizeUsdc: number;
  monitorIntervalSeconds: number;
  portfolioSize: number;
  kellyCap: number;
  minWhaleRoi: number;
  minWhaleTrades: number;
  minWhalePvalue: number;
  minEdgePct: number;
  minPositionUsdc: number;
  logLevel: string;
  logPretty: boolean;
  polygonRpcUrl: string;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  duneApiKey: string | null;
}
