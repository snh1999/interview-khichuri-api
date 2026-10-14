PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prompt_likes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`prompt_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_prompt_likes`("id", "user_id", "prompt_id", "created_at") SELECT "id", "user_id", "prompt_id", "created_at" FROM `prompt_likes`;--> statement-breakpoint
DROP TABLE `prompt_likes`;--> statement-breakpoint
ALTER TABLE `__new_prompt_likes` RENAME TO `prompt_likes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_prompt_likes_prompt` ON `prompt_likes` (`prompt_id`);--> statement-breakpoint
CREATE TABLE `__new_user_default_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`prompt_id` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user_default_prompts`("id", "user_id", "type", "prompt_id") SELECT "id", "user_id", "type", "prompt_id" FROM `user_default_prompts`;--> statement-breakpoint
DROP TABLE `user_default_prompts`;--> statement-breakpoint
ALTER TABLE `__new_user_default_prompts` RENAME TO `user_default_prompts`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_default_prompts_type` ON `user_default_prompts` (`type`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `work_type` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salary_lower` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salary_upper` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `experience_required` integer;--> statement-breakpoint
ALTER TABLE `job_preference` ADD `cover_letter_template` text;--> statement-breakpoint
ALTER TABLE `job_preference` ADD `outreach_email_template` text;--> statement-breakpoint
ALTER TABLE `job_preference` ADD `linkedin_dm_template` text;--> statement-breakpoint
ALTER TABLE `work_overview` ADD `summary` text;