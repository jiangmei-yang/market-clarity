CREATE TABLE `user_snapshots` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
