CREATE TABLE `anomalies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`market_id` text,
	`wallet_address` text,
	`severity` text DEFAULT 'medium' NOT NULL,
	`detected_at` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `markets` (
	`condition_id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`question` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`end_date_iso` text NOT NULL,
	`volume_num` real DEFAULT 0 NOT NULL,
	`liquidity_num` real DEFAULT 0 NOT NULL,
	`maker_base_fee` real DEFAULT 0 NOT NULL,
	`taker_base_fee` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	`resolved_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`wallet_address` text NOT NULL,
	`token_id` text NOT NULL,
	`market` text NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`size` real DEFAULT 0 NOT NULL,
	`avg_price` real DEFAULT 0 NOT NULL,
	`unrealized_pnl` real,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`market` text NOT NULL,
	`asset_id` text NOT NULL,
	`wallet_address` text NOT NULL,
	`side` text NOT NULL,
	`price` real NOT NULL,
	`size` real NOT NULL,
	`fee_rate_bps` real DEFAULT 0 NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`match_time` text NOT NULL,
	`transaction_hash` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_stats` (
	`wallet_address` text PRIMARY KEY NOT NULL,
	`total_trades` integer DEFAULT 0 NOT NULL,
	`resolved_trades` integer DEFAULT 0 NOT NULL,
	`win_rate` real,
	`roi` real,
	`brier_score` real,
	`p_value` real,
	`is_sharp` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
