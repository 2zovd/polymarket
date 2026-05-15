CREATE TABLE `live_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`market_id` text NOT NULL,
	`token_id` text,
	`severity` text,
	`data` text,
	`detected_at` integer NOT NULL
);
CREATE INDEX `idx_live_events_detected_at` ON `live_events` (`detected_at`);
