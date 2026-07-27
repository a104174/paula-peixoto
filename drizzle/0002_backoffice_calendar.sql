ALTER TABLE `appointments` ADD COLUMN `customer_id` text;
--> statement-breakpoint
ALTER TABLE `appointments` ADD COLUMN `duration_minutes` integer NOT NULL DEFAULT 60;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customers` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `phone` text NOT NULL,
  `email` text,
  `notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customers_name_idx` ON `customers` (`name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customers_phone_idx` ON `customers` (`phone`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customers_email_idx` ON `customers` (`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `business_services` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `duration_minutes` integer NOT NULL DEFAULT 60,
  `price` text NOT NULL DEFAULT '',
  `color` text NOT NULL DEFAULT '#D4A373',
  `sort_order` integer NOT NULL DEFAULT 0,
  `is_active` integer NOT NULL DEFAULT 1 CHECK (`is_active` IN (0, 1)),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `business_services_active_order_idx` ON `business_services` (`is_active`, `sort_order`);
--> statement-breakpoint
INSERT OR IGNORE INTO `business_services` VALUES
  ('corte-feminino','Corte Feminino','Um corte personalizado, desenhado para valorizar os seus traços.',45,'Desde 25€','#C9897B',0,1,datetime('now'),datetime('now')),
  ('brushing','Brushing','Finalização com volume, brilho e movimento.',30,'Desde 15€','#D5A95F',1,1,datetime('now'),datetime('now')),
  ('coloracao','Coloração & Madeixas','Coloração, balayage e madeixas com produtos premium.',90,'Desde 35€','#9F7AA5',2,1,datetime('now'),datetime('now')),
  ('masculino','Cabeleireiro Masculino','Cortes precisos e cuidados de barbearia.',35,'Desde 15€','#6F8F8B',3,1,datetime('now'),datetime('now')),
  ('manicure','Manicure & Unhas','Manicure, verniz gel e unhas de gel.',60,'Desde 15€','#D99BA6',4,1,datetime('now'),datetime('now')),
  ('pedicure','Pedicure & Depilação','Cuidados de pés e depilação a cera.',60,'Sob consulta','#A89B78',5,1,datetime('now'),datetime('now'));
--> statement-breakpoint
UPDATE `appointments` SET `duration_minutes` = CASE `service_id`
  WHEN 'corte-feminino' THEN 45 WHEN 'brushing' THEN 30 WHEN 'coloracao' THEN 90
  WHEN 'masculino' THEN 35 WHEN 'manicure' THEN 60 WHEN 'pedicure' THEN 60
  ELSE 60 END;
--> statement-breakpoint
INSERT INTO `customers` (`id`,`name`,`phone`,`email`,`notes`,`created_at`,`updated_at`)
SELECT lower(hex(randomblob(16))), max(`customer_name`), `phone`, max(`email`), NULL,
       min(`created_at`), max(`updated_at`)
FROM `appointments`
WHERE trim(`phone`) <> ''
GROUP BY `phone`;
--> statement-breakpoint
UPDATE `appointments`
SET `customer_id` = (
  SELECT `customers`.`id` FROM `customers`
  WHERE `customers`.`phone` = `appointments`.`phone`
  LIMIT 1
)
WHERE `customer_id` IS NULL;
