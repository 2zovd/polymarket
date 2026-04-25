CREATE TABLE `open_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` integer NOT NULL,
	`token_id` text NOT NULL,
	`condition_id` text NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`size` real NOT NULL,
	`entry_price` real NOT NULL,
	`entry_at` text NOT NULL,
	`is_dry_run` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`payout` real,
	`pnl` real,
	`resolved_at` text
);
