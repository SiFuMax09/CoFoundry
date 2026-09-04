CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_user_provider_idx` ON `api_keys` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `canvas_item_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`content` text NOT NULL,
	`title` text NOT NULL,
	`edited_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `canvas_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `canvas_item_versions_item_idx` ON `canvas_item_versions` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `canvas_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`phase_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`color` text,
	`status` text,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`width` real DEFAULT 280 NOT NULL,
	`height` real DEFAULT 200 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `canvas_items_project_idx` ON `canvas_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `canvas_items_phase_idx` ON `canvas_items` (`phase_id`);--> statement-breakpoint
CREATE TABLE `canvas_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_item_id` text NOT NULL,
	`to_item_id` text NOT NULL,
	`relation_label` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`from_item_id`) REFERENCES `canvas_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_item_id`) REFERENCES `canvas_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `canvas_links_from_idx` ON `canvas_links` (`from_item_id`);--> statement-breakpoint
CREATE INDEX `canvas_links_to_idx` ON `canvas_links` (`to_item_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`phase_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`tool_calls` text,
	`model` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_phase_idx` ON `chat_messages` (`phase_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `phases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`sort_order` integer NOT NULL,
	`system_prompt_override` text,
	`active_chat_model` text,
	`ready_summary` text,
	`ready_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `phases_project_idx` ON `phases` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`onboarding_json` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `search_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`query_normalized` text NOT NULL,
	`query_hash` text NOT NULL,
	`results_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_cache_user_hash_idx` ON `search_cache` (`user_id`,`query_hash`);--> statement-breakpoint
CREATE TABLE `ultraplan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'dispatching' NOT NULL,
	`briefing_json` text NOT NULL,
	`agent_results_json` text,
	`proposal_json` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ultraplan_runs_project_idx` ON `ultraplan_runs` (`project_id`);--> statement-breakpoint
CREATE TABLE `usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`task_type` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cost_estimate` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_log_user_idx` ON `usage_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);