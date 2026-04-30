ALTER TABLE `markets` ADD `event_slug` text;--> statement-breakpoint
ALTER TABLE `markets` ADD `accepting_orders` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `wallet_stats` ADD `avg_position_size_usdc` real;--> statement-breakpoint
ALTER TABLE `watched_positions` ADD `first_seen_at` text;