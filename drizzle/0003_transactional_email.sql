CREATE TABLE IF NOT EXISTS `email_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `appointment_id` text NOT NULL,
  `recipient` text NOT NULL,
  `type` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `attempts` integer NOT NULL DEFAULT 0,
  `last_error` text,
  `idempotency_key` text NOT NULL,
  `provider` text NOT NULL,
  `provider_message_id` text,
  `subject` text NOT NULL,
  `html_body` text NOT NULL,
  `text_body` text NOT NULL,
  `last_event` text,
  `last_event_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `email_outbox_idempotency_unique`
  ON `email_outbox` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_outbox_appointment_idx`
  ON `email_outbox` (`appointment_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_outbox_status_idx`
  ON `email_outbox` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_outbox_provider_message_idx`
  ON `email_outbox` (`provider_message_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_webhook_events` (
  `id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `provider_message_id` text,
  `received_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_webhook_provider_message_idx`
  ON `email_webhook_events` (`provider_message_id`);
