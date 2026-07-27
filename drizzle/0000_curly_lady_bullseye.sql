CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`service_name` text NOT NULL,
	`appointment_date` text NOT NULL,
	`appointment_time` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`notes` text,
	`status` text DEFAULT 'pendente' NOT NULL,
	`source` text DEFAULT 'website' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `appointments_date_idx` ON `appointments` (`appointment_date`);--> statement-breakpoint
CREATE INDEX `appointments_status_idx` ON `appointments` (`status`);