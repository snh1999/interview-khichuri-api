CREATE TYPE "public"."provider" AS ENUM('google', 'openai', 'groq', 'openrouter', 'mistral', 'github', 'cerebras');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('applied', 'saved', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('junior', 'mid', 'senior', 'lead', 'executive');--> statement-breakpoint
CREATE TYPE "public"."link_type" AS ENUM('github', 'gitlab', 'linkedin', 'portfolio', 'blog', 'scholar', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('project', 'research');--> statement-breakpoint
CREATE TYPE "public"."work_type" AS ENUM('remote', 'hybrid', 'onsite');--> statement-breakpoint
CREATE TYPE "public"."prompt_type" AS ENUM('resume', 'behavioral', 'technical', 'system_design', 'general', 'custom');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp (6) with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean NOT NULL,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp (6) with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp (6) with time zone,
	"two_factor_enabled" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"source" text DEFAULT 'custom' NOT NULL,
	"source_id" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[],
	"links" jsonb,
	"career_page_url" text,
	"research_dossier" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"provider" "provider" NOT NULL,
	"key" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"topic_id" integer NOT NULL,
	CONSTRAINT "idx_job_topics_unique" UNIQUE("job_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"company_name" text NOT NULL,
	"company_id" integer,
	"description" text NOT NULL,
	"location" text,
	"source" text,
	"interview_date" timestamp,
	"status" "status" DEFAULT 'saved' NOT NULL,
	"role_id" integer,
	"links" text,
	"notes" text,
	"is_favorite" boolean DEFAULT false,
	"deadline" timestamp,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"isApproved" boolean,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"isApproved" boolean,
	CONSTRAINT "industries_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"isApproved" boolean,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"isApproved" boolean,
	"category_id" integer,
	CONSTRAINT "topics_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text,
	"mode" text DEFAULT 'qa_flow' NOT NULL,
	"focus_types" text[],
	"topic_names" text[],
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"overall_score" integer,
	"technical_score" integer,
	"communication_score" integer,
	"problem_solving_score" integer,
	"leadership_fit_score" integer,
	"elapsed_seconds" integer,
	"summary_markdown" text,
	"strengths" text[],
	"improvements" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prep_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"job_id" uuid,
	"role_id" integer,
	"title" text NOT NULL,
	"experience" text,
	"description" text,
	"is_favorite" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"answer" text,
	"notes" text,
	"is_favorite" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"topic_id" integer NOT NULL,
	CONSTRAINT "idx_session_topics_unique" UNIQUE("session_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"question_id" integer,
	"job_id" uuid,
	"title" text NOT NULL,
	"details" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notes_single_attachment_invariant" CHECK (("notes"."question_id" IS NULL OR "notes"."job_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"name" text NOT NULL,
	"organization" text,
	"position" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"is_current" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"degree_name" text NOT NULL,
	"field_of_study" text,
	"institution" text NOT NULL,
	"location" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"is_current" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"work_type" "work_type",
	"salary_lower" integer,
	"salary_expected" integer,
	"currency" text DEFAULT 'USD',
	"preferred_location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preference_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"preference_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "idx_preference_titles_unique" UNIQUE("preference_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "profile_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"type" "link_type" NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "idx_profile_links_unique" UNIQUE("profile_id","type")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"phone" text,
	"email" text,
	"location" text,
	"country" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	CONSTRAINT "idx_project_skills_unique" UNIQUE("project_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "project_type" DEFAULT 'project' NOT NULL,
	"description" text,
	"link" text
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"title" text NOT NULL,
	"authors" text DEFAULT '[]' NOT NULL,
	"notes" text,
	"link" text,
	"year" integer,
	"publication_type" text
);
--> statement-breakpoint
CREATE TABLE "references" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"company" text,
	"email" text,
	"phone" text,
	"relation_type" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "resume" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"content" text,
	"template" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"slug" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "idx_resume_slug" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "work_experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"company" text NOT NULL,
	"company_id" integer,
	"title" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"is_current" boolean DEFAULT false NOT NULL,
	"responsibilities" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_industries" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_id" integer NOT NULL,
	"industry_id" integer NOT NULL,
	CONSTRAINT "idx_overview_industries_unique" UNIQUE("work_id","industry_id")
);
--> statement-breakpoint
CREATE TABLE "work_overview" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"title" text NOT NULL,
	"experience_level" "experience_level",
	"years_of_experience" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	CONSTRAINT "idx_overview_skills_unique" UNIQUE("work_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prompt_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text DEFAULT '' NOT NULL,
	"prompt" text NOT NULL,
	"type" "prompt_type" NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_default_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "prompt_type" NOT NULL,
	"prompt_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_topics" ADD CONSTRAINT "job_topics_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_topics" ADD CONSTRAINT "job_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_session_id_prep_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prep_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_session_id_prep_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prep_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_topics" ADD CONSTRAINT "session_topics_session_id_prep_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prep_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_topics" ADD CONSTRAINT "session_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education" ADD CONSTRAINT "education_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_preference" ADD CONSTRAINT "job_preference_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_titles" ADD CONSTRAINT "preference_titles_preference_id_job_preference_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."job_preference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_titles" ADD CONSTRAINT "preference_titles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_links" ADD CONSTRAINT "profile_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume" ADD CONSTRAINT "resume_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_experience" ADD CONSTRAINT "work_experience_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_experience" ADD CONSTRAINT "work_experience_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_industries" ADD CONSTRAINT "work_industries_work_id_work_overview_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_overview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_industries" ADD CONSTRAINT "work_industries_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_overview" ADD CONSTRAINT "work_overview_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_skills" ADD CONSTRAINT "work_skills_work_id_work_overview_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_overview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_skills" ADD CONSTRAINT "work_skills_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_likes" ADD CONSTRAINT "prompt_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_likes" ADD CONSTRAINT "prompt_likes_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_default_prompts" ADD CONSTRAINT "user_default_prompts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_default_prompts" ADD CONSTRAINT "user_default_prompts_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cal_events_user" ON "calendar_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cal_events_source" ON "calendar_events" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_active_api_key" ON "api_key" USING btree ("provider","user_id") WHERE "api_key"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_job_id" ON "job_topics" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_creator_index" ON "jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_title_fts" ON "jobs" USING gist (to_tsvector('english', "title"));--> statement-breakpoint
CREATE INDEX "idx_jobs_full_fts" ON "jobs" USING gist (to_tsvector('english', coalesce("title",'') || ' ' || coalesce("description",'')));--> statement-breakpoint
CREATE INDEX "idx_jobs_fav_created" ON "jobs" USING btree ("is_favorite","created_at");--> statement-breakpoint
CREATE INDEX "idx_categories_name_fts" ON "categories" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX "idx_industries_name_fts" ON "industries" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX "idx_roles_name_fts" ON "roles" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX "idx_topics_name_fts" ON "topics" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX "idx_interview_session_id" ON "interviews" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_interview_user_id" ON "interviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "prep_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_job_session" ON "prep_session" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_session_fav_created" ON "prep_session" USING btree ("is_favorite","created_at");--> statement-breakpoint
CREATE INDEX "idx_session_id" ON "session_topics" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_notes_user_id" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notes_question_id" ON "notes" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_notes_job_id" ON "notes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_activities_profile_id" ON "activities" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_education_profile_id" ON "education" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_preference_titles_preference_id" ON "preference_titles" USING btree ("preference_id");--> statement-breakpoint
CREATE INDEX "idx_profile_links_profile_id" ON "profile_links" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_project_skills_project_id" ON "project_skills" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_projects_profile_id" ON "projects" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_publications_profile_id" ON "publications" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_references_profile_id" ON "references" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_resume_profile_id" ON "resume" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_work_experience_profile_id" ON "work_experience" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_overview_industries_overview_id" ON "work_industries" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "idx_overview_skills_overview_id" ON "work_skills" USING btree ("work_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prompt_likes_user_prompt" ON "prompt_likes" USING btree ("user_id","prompt_id");--> statement-breakpoint
CREATE INDEX "idx_prompts_public_type" ON "prompts" USING btree ("is_public","type");--> statement-breakpoint
CREATE INDEX "idx_prompts_likes" ON "prompts" USING btree ("like_count");--> statement-breakpoint
CREATE INDEX "idx_prompts_user" ON "prompts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_default_prompts_user_type" ON "user_default_prompts" USING btree ("user_id","type");