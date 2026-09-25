CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`source` text DEFAULT 'custom' NOT NULL,
	`source_id` text,
	`color` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cal_events_user` ON `calendar_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_cal_events_source` ON `calendar_events` (`source`,`source_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`aliases` text,
	`links` text,
	`career_page_url` text,
	`research_dossier` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_unique` ON `companies` (`name`);--> statement-breakpoint
CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text,
	`provider` text NOT NULL,
	`key` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`model` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_active_api_key` ON `api_key` (`provider`,`user_id`) WHERE "api_key"."is_active" = 1;--> statement-breakpoint
CREATE TABLE `job_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`topic_id` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_job_id` ON `job_topics` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_job_topics_unique` ON `job_topics` (`job_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`company_name` text NOT NULL,
	`company_id` integer,
	`user_id` text,
	`description` text NOT NULL,
	`location` text,
	`source` text,
	`interview_date` integer,
	`status` text DEFAULT 'saved' NOT NULL,
	`role_id` integer,
	`links` text,
	`notes` text,
	`is_favorite` integer DEFAULT false,
	`deadline` integer,
	`applied_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_fav_created` ON `jobs` (`is_favorite`,`created_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`isApproved` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `industries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`isApproved` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `industries_name_unique` ON `industries` (`name`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`isApproved` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`isApproved` integer,
	`category_id` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topics_name_unique` ON `topics` (`name`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`mode` text DEFAULT 'qa_flow' NOT NULL,
	`focus_types` text,
	`topic_names` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`overall_score` integer,
	`technical_score` integer,
	`communication_score` integer,
	`problem_solving_score` integer,
	`leadership_fit_score` integer,
	`elapsed_seconds` integer,
	`summary_markdown` text,
	`strengths` text,
	`improvements` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `prep_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_interview_session_id` ON `interviews` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_interview_user_id` ON `interviews` (`user_id`);--> statement-breakpoint
CREATE TABLE `prep_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`job_id` text,
	`role_id` integer,
	`title` text NOT NULL,
	`experience` text,
	`description` text,
	`is_favorite` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_session_user_id` ON `prep_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_job_session` ON `prep_session` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_session_fav_created` ON `prep_session` (`is_favorite`,`created_at`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`question_text` text NOT NULL,
	`answer` text,
	`notes` text,
	`is_favorite` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `prep_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`topic_id` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `prep_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_session_id` ON `session_topics` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_session_topics_unique` ON `session_topics` (`session_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`question_id` integer,
	`job_id` text,
	`title` text NOT NULL,
	`details` text,
	`is_favorite` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notes_single_attachment_invariant" CHECK(("notes"."question_id" IS NULL OR "notes"."job_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_notes_user_id` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_question_id` ON `notes` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_job_id` ON `notes` (`job_id`);--> statement-breakpoint
CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`organization` text,
	`position` text,
	`start_date` integer,
	`end_date` integer,
	`is_current` integer DEFAULT false NOT NULL,
	`notes` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_activities_profile_id` ON `activities` (`profile_id`);--> statement-breakpoint
CREATE TABLE `education` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`degree_name` text NOT NULL,
	`field_of_study` text,
	`institution` text NOT NULL,
	`location` text,
	`start_date` integer,
	`end_date` integer,
	`is_current` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_education_profile_id` ON `education` (`profile_id`);--> statement-breakpoint
CREATE TABLE `job_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`work_type` text,
	`salary_lower` integer,
	`salary_expected` integer,
	`currency` text DEFAULT 'USD',
	`preferred_location` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preference_titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preference_id` text NOT NULL,
	`role_id` integer NOT NULL,
	FOREIGN KEY (`preference_id`) REFERENCES `job_preference`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_preference_titles_preference_id` ON `preference_titles` (`preference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_preference_titles_unique` ON `preference_titles` (`preference_id`,`role_id`);--> statement-breakpoint
CREATE TABLE `profile_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_profile_links_profile_id` ON `profile_links` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_profile_links_unique` ON `profile_links` (`profile_id`,`type`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`phone` text,
	`email` text,
	`location` text,
	`country` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`topic_id` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_skills_project_id` ON `project_skills` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_skills_unique` ON `project_skills` (`project_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'project' NOT NULL,
	`description` text,
	`link` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_projects_profile_id` ON `projects` (`profile_id`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`title` text NOT NULL,
	`authors` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`link` text,
	`year` integer,
	`publication_type` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_publications_profile_id` ON `publications` (`profile_id`);--> statement-breakpoint
CREATE TABLE `references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`company` text,
	`email` text,
	`phone` text,
	`relation_type` text,
	`notes` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_references_profile_id` ON `references` (`profile_id`);--> statement-breakpoint
CREATE TABLE `resume` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`content` text,
	`template` text,
	`is_public` integer DEFAULT false NOT NULL,
	`slug` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_resume_profile_id` ON `resume` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_resume_slug` ON `resume` (`slug`);--> statement-breakpoint
CREATE TABLE `work_experience` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`company` text NOT NULL,
	`company_id` integer,
	`title` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`is_current` integer DEFAULT false NOT NULL,
	`responsibilities` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_work_experience_profile_id` ON `work_experience` (`profile_id`);--> statement-breakpoint
CREATE TABLE `work_industries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_id` integer NOT NULL,
	`industry_id` integer NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `work_overview`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`industry_id`) REFERENCES `industries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_overview_industries_overview_id` ON `work_industries` (`work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_overview_industries_unique` ON `work_industries` (`work_id`,`industry_id`);--> statement-breakpoint
CREATE TABLE `work_overview` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`title` text NOT NULL,
	`experience_level` text,
	`years_of_experience` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `work_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_id` integer NOT NULL,
	`topic_id` integer NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `work_overview`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_overview_skills_overview_id` ON `work_skills` (`work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_overview_skills_unique` ON `work_skills` (`work_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `prompt_likes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`prompt_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_prompt_likes_user_prompt` ON `prompt_likes` (`user_id`,`prompt_id`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`title` text DEFAULT '' NOT NULL,
	`prompt` text NOT NULL,
	`type` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_prompts_public_type` ON `prompts` (`is_public`,`type`);--> statement-breakpoint
CREATE INDEX `idx_prompts_likes` ON `prompts` (`like_count`);--> statement-breakpoint
CREATE TABLE `user_default_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`prompt_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_default_prompts_user_type` ON `user_default_prompts` (`user_id`,`type`);