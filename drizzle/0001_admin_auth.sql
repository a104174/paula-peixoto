CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL UNIQUE,
  `password_hash` text NOT NULL,
  `display_name` text NOT NULL,
  `role` text DEFAULT 'admin' NOT NULL CHECK (`role` IN ('owner', 'admin')),
  `is_active` integer DEFAULT 1 NOT NULL CHECK (`is_active` IN (0, 1)),
  `must_change_password` integer DEFAULT 1 NOT NULL CHECK (`must_change_password` IN (0, 1)),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `admin_users_email_unique` ON `admin_users` (`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admin_users_active_role_idx` ON `admin_users` (`is_active`, `role`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `last_used_at` text NOT NULL,
  `revoked_at` text,
  `user_agent` text,
  FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `admin_sessions_token_hash_unique` ON `admin_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admin_sessions_user_idx` ON `admin_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_login_attempts` (
  `key_hash` text PRIMARY KEY NOT NULL,
  `failures` integer DEFAULT 0 NOT NULL,
  `window_started_at` text NOT NULL,
  `blocked_until` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `public_rate_limits` (
  `key_hash` text PRIMARY KEY NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `window_started_at` text NOT NULL,
  `blocked_until` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_password_reset_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `used_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `admin_password_reset_token_hash_unique` ON `admin_password_reset_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admin_password_reset_user_idx` ON `admin_password_reset_tokens` (`user_id`);
