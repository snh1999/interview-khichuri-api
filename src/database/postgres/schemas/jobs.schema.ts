import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  JOB_PROVIDERS,
  JOB_STATES,
  JOB_STATUS,
} from "@/src/database/database.constants";
import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";

import { user } from "./auth.schema";
import { companies } from "./company.schema";
import { roles, topics } from "./lookups.schema";
import { workTypeEnum } from "./profile.schema";

export const jobProviderEnum = pgEnum("job_provider", JOB_PROVIDERS);
export const jobStateEnum = pgEnum("job_state", JOB_STATES);
export const statusEnum = pgEnum("status", JOB_STATUS);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    companyName: text("company_name").notNull(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    location: text("location"),
    url: text("url"),
    provider: jobProviderEnum("provider"),
    externalId: text("external_id"),
    state: jobStateEnum("state").notNull().default("none"),
    stateChangedAt: timestamp("state_changed_at").notNull().defaultNow(),
    missedCrawls: integer("missed_crawls").notNull().default(0),
    closedAt: timestamp("closed_at"),
    workType: workTypeEnum("work_type"),
    salaryLower: integer("salary_lower"),
    salaryUpper: integer("salary_upper"),
    currency: text("currency"),
    experienceRequired: integer("experience_required"),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    links: text("links"),
    deadline: timestamp("deadline"),
    ...defaultTimeStamps,
  },
  (table) => [
    check(
      "jobs_state_requires_description",
      sql`${table.state} <> 'ok' OR ${table.description} IS NOT NULL`,
    ),
    check(
      "jobs_system_identity",
      sql`${table.userId} IS NOT NULL OR (${table.companyId} IS NOT NULL AND ${table.url} IS NOT NULL)`,
    ),
    uniqueIndex("idx_jobs_company_provider_external")
      .on(table.companyId, table.provider, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    uniqueIndex("idx_jobs_company_url_system")
      .on(table.companyId, table.url)
      .where(sql`${table.userId} IS NULL`),
    index("job_creator_index").on(table.userId),
    index("idx_jobs_title_fts").using(
      "gist",
      sql`to_tsvector('english', ${table.title})`,
    ),
    index("idx_jobs_full_fts").using(
      "gist",
      sql`to_tsvector('english', coalesce(${table.title},'') || ' ' || coalesce(${table.description},''))`,
    ),
    index("idx_jobs_company_state").on(table.companyId, table.state),
    index("idx_jobs_state_created").on(table.state, table.createdAt),
    index("idx_jobs_closed_at").on(table.closedAt),
    index("idx_jobs_system_url")
      .on(table.url)
      .where(sql`${table.userId} IS NULL`),
  ],
);

export const tracked_jobs = pgTable(
  "tracked_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The migration adds this FK as DEFERRABLE INITIALLY DEFERRED so the sweep can
    // delete a job and its track in one transaction. Drizzle cannot express it.
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "no action" }),
    status: statusEnum("status").notNull().default("saved"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    notes: text("notes"),
    appliedAt: timestamp("applied_at"),
    interviewDate: timestamp("interview_date"),
    ...defaultTimeStamps,
  },
  (table) => [
    unique("idx_tracked_jobs_user_job_unique").on(table.userId, table.jobId),
    index("idx_tracked_jobs_user_fav_created").on(
      table.userId,
      table.isFavorite,
      table.createdAt,
    ),
    index("idx_tracked_jobs_job_id").on(table.jobId),
  ],
);

export const job_topics = pgTable(
  "job_topics",
  {
    id: serial("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_job_id").on(table.jobId),
    unique("idx_job_topics_unique").on(table.jobId, table.topicId),
  ],
);

export const jobRelations = relations(jobs, ({ one, many }) => ({
  jobTopics: many(job_topics),
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id],
  }),
}));

export const trackedJobRelations = relations(tracked_jobs, ({ one }) => ({
  job: one(jobs, {
    fields: [tracked_jobs.jobId],
    references: [jobs.id],
  }),
  user: one(user, {
    fields: [tracked_jobs.userId],
    references: [user.id],
  }),
}));

export const jobTopicRelations = relations(job_topics, ({ one }) => ({
  job: one(jobs, {
    fields: [job_topics.jobId],
    references: [jobs.id],
  }),
  topic: one(topics, {
    fields: [job_topics.topicId],
    references: [topics.id],
  }),
}));
