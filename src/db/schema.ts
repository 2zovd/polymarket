import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ─── Markets ──────────────────────────────────────────────────────────────────

export const markets = sqliteTable('markets', {
  conditionId: text('condition_id').primaryKey(),
  questionId: text('question_id').notNull(),
  question: text('question').notNull(),
  description: text('description').notNull().default(''),
  slug: text('slug').notNull(),
  status: text('status').notNull(), // 'active' | 'closed' | 'resolved' | 'cancelled'
  endDateIso: text('end_date_iso').notNull(),
  volumeNum: real('volume_num').notNull().default(0),
  liquidityNum: real('liquidity_num').notNull().default(0),
  makerBaseFee: real('maker_base_fee').notNull().default(0),
  takerBaseFee: real('taker_base_fee').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(false),
  closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
  resolvedAt: text('resolved_at'), // ISO string, null until resolved
  // JSON string arrays from Gamma API, e.g. '["1","0"]' (outcome 0 won) or '["0","1"]'
  outcomePrices: text('outcome_prices'),
  outcomes: text('outcomes'),
  updatedAt: text('updated_at').notNull(),
});

// ─── Trades ───────────────────────────────────────────────────────────────────

export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  market: text('market').notNull(),
  assetId: text('asset_id').notNull(),
  walletAddress: text('wallet_address').notNull(),
  side: text('side').notNull(), // 'BUY' | 'SELL'
  price: real('price').notNull(),
  size: real('size').notNull(),
  feeRateBps: real('fee_rate_bps').notNull().default(0),
  outcome: text('outcome').notNull().default(''),
  status: text('status').notNull(),
  matchTime: text('match_time').notNull(),
  transactionHash: text('transaction_hash').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

// ─── Positions ────────────────────────────────────────────────────────────────

export const positions = sqliteTable('positions', {
  // Composite PK enforced via unique constraint; drizzle uses first column as rowid
  walletAddress: text('wallet_address').notNull(),
  tokenId: text('token_id').notNull(),
  market: text('market').notNull(),
  outcome: text('outcome').notNull().default(''),
  size: real('size').notNull().default(0),
  avgPrice: real('avg_price').notNull().default(0),
  // Computed at collection time from current market price
  unrealizedPnl: real('unrealized_pnl'),
  updatedAt: text('updated_at').notNull(),
});

// ─── Wallet Stats ─────────────────────────────────────────────────────────────

export const walletStats = sqliteTable('wallet_stats', {
  walletAddress: text('wallet_address').primaryKey(),
  totalTrades: integer('total_trades').notNull().default(0),
  resolvedTrades: integer('resolved_trades').notNull().default(0),
  winRate: real('win_rate'), // null until enough resolved data
  roi: real('roi'),
  brierScore: real('brier_score'),
  // Two-tailed t-test p-value against H₀: mean ROI = 0
  pValue: real('p_value'),
  // true when p < 0.05 AND roi > 0.05 AND brierScore < 0.22 AND resolvedTrades >= 30
  isSharp: integer('is_sharp', { mode: 'boolean' }).notNull().default(false),
  // true when p < 0.05 AND roi > 0 AND resolvedTrades >= 30 (ignores Brier — copy trading signal)
  isProfitable: integer('is_profitable', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
});

// ─── Watched Positions (whale position snapshots for change detection) ────────

export const watchedPositions = sqliteTable(
  'watched_positions',
  {
    walletAddress: text('wallet_address').notNull(),
    tokenId: text('token_id').notNull(),
    conditionId: text('condition_id').notNull(),
    outcome: text('outcome').notNull().default(''),
    size: real('size').notNull().default(0),
    avgPrice: real('avg_price').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.walletAddress, t.tokenId] })],
);

// ─── Copy Trading Signals ─────────────────────────────────────────────────────

export const signals = sqliteTable('signals', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  walletAddress: text('wallet_address').notNull(),
  conditionId: text('condition_id').notNull(),
  tokenId: text('token_id').notNull(),
  outcome: text('outcome').notNull().default(''),
  whaleAvgPrice: real('whale_avg_price').notNull(),
  currentAsk: real('current_ask').notNull(),
  edge: real('edge').notNull(), // whaleAvgPrice - currentAsk
  kellySize: real('kelly_size').notNull(), // USDC calculated by Kelly
  executedSize: real('executed_size').notNull().default(0),
  orderId: text('order_id'), // null if dry-run or skipped
  // 'executed' | 'skipped' | 'dry-run' | 'error'
  status: text('status').notNull(),
  skipReason: text('skip_reason'), // reason if status = 'skipped'
  dryRun: integer('dry_run', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

// ─── Anomalies ────────────────────────────────────────────────────────────────

export const anomalies = sqliteTable('anomalies', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  // 'volume_spike' | 'coordinated_entry' | 'unknown_large_position' | 'price_impact'
  type: text('type').notNull(),
  marketId: text('market_id'),
  walletAddress: text('wallet_address'),
  severity: text('severity').notNull().default('medium'), // 'low' | 'medium' | 'high'
  detectedAt: text('detected_at').notNull(),
  // JSON blob — shape depends on anomaly type
  metadata: text('metadata').notNull().default('{}'),
});
