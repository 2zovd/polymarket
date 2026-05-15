// Core Polymarket domain types.
// These mirror shapes returned by the CLOB and Gamma APIs after Zod validation.

// ─── Market ──────────────────────────────────────────────────────────────────

export type MarketStatus = 'active' | 'closed' | 'resolved' | 'cancelled';

// Gamma API market shape — matches actual response from /markets endpoint.
// Field names are as returned by the API (some quirks: questionID vs questionId).
export interface MarketEvent {
  id: string;
  slug: string;
  title?: string;
}

export interface Market {
  conditionId: string;
  // Gamma returns questionID (capital ID); questionId alias kept for compatibility
  questionID?: string;
  questionId?: string;
  question: string;
  description?: string;
  slug: string;
  // Parent event(s). polymarket.com/event/<slug> URLs use events[0].slug, NOT market.slug.
  events?: MarketEvent[];
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
  // Distinct from `active`: the CLOB may stop accepting new orders during close-out window.
  acceptingOrders?: boolean;
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
  maxCopyAsk: number;
  minPositionUsdc: number;
  logLevel: string;
  logPretty: boolean;
  polygonRpcUrl: string;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  duneApiKey: string | null;
  maxOpenPositions: number;
  /** Skip markets with less than this many hours until expiry. Set to 0 to allow micro-markets. */
  minMarketHoursRemaining: number;
  /** Hard floor: never enter with less than this many minutes remaining, regardless of hours setting. */
  minMarketMinutesBuffer: number;
  /** Interval for trade stream polling in seconds (default: 60) */
  streamIntervalSeconds: number;
  /** Skip positions first seen more than this many hours ago. Filters stale entries already priced in. */
  maxPositionAgeHours: number;
  /** Minimum average USDC per resolved BUY trade for a whale wallet. 0 = disabled. */
  minAvgPositionUsdc: number;
  /**
   * Minimum ratio of currentAsk / whaleAvgPrice. Prevents copying a whale whose
   * position has already repriced heavily against them.
   * e.g. 0.5 = skip if market fell more than 50% from whale's entry. 0 = disabled.
   */
  minWhaleAskRatio: number;
  /** Minimum edge (whaleAvgPrice - currentAsk) to enter. Filters near-zero-edge noise. */
  minEdge: number;
  /**
   * When true, only signal on a whale's first entry into a market (prev snapshot absent).
   * Skips position-growth triggers where the market has already partially priced in the thesis.
   */
  firstEntryOnly: boolean;
  /** Also track is_profitable wallets (not just is_sharp) that meet looser thresholds. */
  includeProfitableWhales: boolean;
  /** Minimum ROI for is_profitable (non-sharp) whales. Higher than minWhaleRoi. */
  minProfitableRoi: number;
  /** Minimum resolved trades for is_profitable (non-sharp) whales. */
  minProfitableTrades: number;
  /** Minimum average position size (USDC) for is_profitable (non-sharp) whales. 0 = disabled. */
  minProfitableAvgPos: number;
  /**
   * Skip whale wallets whose recent positions are dominated by "Up or Down" micro-markets.
   * Value is the max allowed fraction (0–1) of micro positions over the past 3 days.
   * e.g. 0.7 = skip wallets where >70% of recent positions are Up or Down markets.
   * 0 = disabled (no filter applied).
   */
  maxMicroPositionRatio: number;
  /**
   * Maximum churn ratio (total trades / resolved trades) for tracked whale wallets.
   * High churn with near-zero ROI is the market-maker fingerprint — not a directional signal.
   * 0 = disabled.
   */
  maxChurnRatio: number;
  /** Dune query IDs to run for weekly wallet discovery. Supports multiple sources. */
  duneQueryIds: number[];
  /** Maximum number of simultaneously active WebSocket market subscriptions. */
  wsMaxSubscriptions: number;
  /** Maximum backoff delay (ms) for WS reconnection attempts. */
  wsReconnectMaxDelayMs: number;
  /**
   * Minutes after which a WS-sourced signal is no longer considered a duplicate.
   * Guards against the polling cycle re-entering the same position the WS already copied.
   */
  wsSignalDedupMinutes: number;
  /** Days to retain live_events rows before pruning. */
  liveEventsRetentionDays: number;
  /** Minimum USDC size of a single trade to trigger a large_trade live event. */
  wsLargeTradeUsdc: number;
}
