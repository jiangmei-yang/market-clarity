CREATE TABLE `ai_provider_profiles` (
	`owner_key` text NOT NULL,
	`provider_id` text NOT NULL,
	`display_name` text NOT NULL,
	`provider_type` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`api_mode` text NOT NULL,
	`enabled` integer NOT NULL,
	`capabilities` text NOT NULL,
	`secret_cipher` text NOT NULL,
	`secret_iv` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_key`, `provider_id`)
);
