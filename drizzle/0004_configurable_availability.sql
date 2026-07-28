CREATE TABLE `availability_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `minimum_notice_minutes` integer DEFAULT 0 NOT NULL,
  `booking_horizon_days` integer DEFAULT 90 NOT NULL,
  `buffer_minutes` integer DEFAULT 0 NOT NULL,
  `slot_interval_minutes` integer DEFAULT 30 NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `availability_work_periods` (
  `id` text PRIMARY KEY NOT NULL,
  `weekday` integer NOT NULL CHECK (`weekday` BETWEEN 0 AND 6),
  `start_time` text NOT NULL,
  `end_time` text NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `availability_work_periods_weekday_idx` ON `availability_work_periods` (`weekday`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `availability_blocks` (
  `id` text PRIMARY KEY NOT NULL,
  `label` text,
  `start_date` text NOT NULL,
  `end_date` text NOT NULL,
  `start_time` text,
  `end_time` text,
  `all_day` integer DEFAULT 1 NOT NULL CHECK (`all_day` IN (0, 1)),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `availability_blocks_dates_idx` ON `availability_blocks` (`start_date`,`end_date`);
