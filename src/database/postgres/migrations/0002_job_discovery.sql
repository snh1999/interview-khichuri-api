CREATE TYPE "public"."company_provider" AS ENUM('greenhouse', 'lever', 'ashby', 'workday', 'scrape');--> statement-breakpoint
CREATE TYPE "public"."job_provider" AS ENUM('greenhouse', 'lever', 'ashby', 'workday', 'scrape', 'manual');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('none', 'ok', 'failed');--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'interviewed';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'offer';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'not_selected';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'withdrawn';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "provider" "company_provider";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ats_board_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "feed" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "crawled_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "crawl_error" text;--> statement-breakpoint
ALTER TABLE "jobs" RENAME COLUMN "source" TO "url";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "provider" "job_provider";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "state" "job_state" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "state_changed_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "missed_crawls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
UPDATE "jobs" SET "links" = NULL;--> statement-breakpoint
CREATE TABLE "tracked_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "status" DEFAULT 'saved' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"notes" text,
	"applied_at" timestamp,
	"interview_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "idx_tracked_jobs_user_job_unique" UNIQUE("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "tracked_jobs" ADD CONSTRAINT "tracked_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_jobs" ADD CONSTRAINT "tracked_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "idx_tracked_jobs_user_fav_created" ON "tracked_jobs" USING btree ("user_id","is_favorite","created_at");--> statement-breakpoint
CREATE INDEX "idx_tracked_jobs_job_id" ON "tracked_jobs" USING btree ("job_id");--> statement-breakpoint
INSERT INTO "tracked_jobs" ("id", "user_id", "job_id", "status", "is_favorite", "notes", "applied_at", "interview_date", "created_at", "updated_at")
SELECT gen_random_uuid(), "user_id", "id", "status", coalesce("is_favorite", false), "notes", "applied_at", "interview_date", "created_at", "updated_at"
FROM "jobs"
WHERE "user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "jobs" SET "state" = 'ok' WHERE "description" IS NOT NULL;--> statement-breakpoint
UPDATE "jobs" SET "provider" = 'manual';--> statement-breakpoint
DROP INDEX "idx_jobs_fav_created";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "is_favorite";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "notes";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "applied_at";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "interview_date";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_state_requires_description" CHECK ("jobs"."state" <> 'ok' OR "jobs"."description" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_system_identity" CHECK ("jobs"."user_id" IS NOT NULL OR ("jobs"."company_id" IS NOT NULL AND "jobs"."url" IS NOT NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_jobs_company_provider_external" ON "jobs" USING btree ("company_id","provider","external_id") WHERE "jobs"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_jobs_company_url_system" ON "jobs" USING btree ("company_id","url") WHERE "jobs"."user_id" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_jobs_company_state" ON "jobs" USING btree ("company_id","state");--> statement-breakpoint
CREATE INDEX "idx_jobs_state_created" ON "jobs" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_closed_at" ON "jobs" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_system_url" ON "jobs" USING btree ("url") WHERE "jobs"."user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_single_attachment_invariant";--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_question_id_questions_id_fk";--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_job_id_jobs_id_fk";--> statement-breakpoint
DROP INDEX "idx_notes_question_id";--> statement-breakpoint
DROP INDEX "idx_notes_job_id";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "question_id";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "job_id";--> statement-breakpoint
