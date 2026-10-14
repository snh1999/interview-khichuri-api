ALTER TABLE "prompt_likes" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_default_prompts" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "work_type" "work_type";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_lower" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_upper" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "experience_required" integer;--> statement-breakpoint
ALTER TABLE "job_preference" ADD COLUMN "cover_letter_template" text;--> statement-breakpoint
ALTER TABLE "job_preference" ADD COLUMN "outreach_email_template" text;--> statement-breakpoint
ALTER TABLE "job_preference" ADD COLUMN "linkedin_dm_template" text;--> statement-breakpoint
ALTER TABLE "work_overview" ADD COLUMN "summary" text;