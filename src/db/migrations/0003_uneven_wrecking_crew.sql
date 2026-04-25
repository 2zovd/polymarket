CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`condition_id` text NOT NULL,
	`token_id` text NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`whale_avg_price` real NOT NULL,
	`current_ask` real NOT NULL,
	`edge` real NOT NULL,
	`kelly_size` real NOT NULL,
	`executed_size` real DEFAULT 0 NOT NULL,
	`order_id` text,
	`status` text NOT NULL,
	`skip_reason` text,
	`dry_run` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watched_positions` (
	`wallet_address` text NOT NULL,
	`token_id` text NOT NULL,
	`condition_id` text NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`size` real DEFAULT 0 NOT NULL,
	`avg_price` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
