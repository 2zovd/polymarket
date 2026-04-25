PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_watched_positions` (
	`wallet_address` text NOT NULL,
	`token_id` text NOT NULL,
	`condition_id` text NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`size` real DEFAULT 0 NOT NULL,
	`avg_price` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`wallet_address`, `token_id`)
);
--> statement-breakpoint
INSERT INTO `__new_watched_positions`("wallet_address", "token_id", "condition_id", "outcome", "size", "avg_price", "updated_at") SELECT "wallet_address", "token_id", "condition_id", "outcome", "size", "avg_price", "updated_at" FROM `watched_positions`;--> statement-breakpoint
DROP TABLE `watched_positions`;--> statement-breakpoint
ALTER TABLE `__new_watched_positions` RENAME TO `watched_positions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;