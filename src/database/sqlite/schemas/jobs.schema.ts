import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
  JOB_PROVIDERS,
  JOB_STATES,
  JOB_STATUS,
} from "@/src/database/database.constants";
import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";
import { PROFILE_WORK_TYPES } from "@/src/profile/profile.dto";

import { companies } from "./company.schema";
import { topics, roles } from "./lookups.schema";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    companyName: text("company_name").notNull(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    userId: text("user_id"),
    description: text("description"),
    location: text("location"),
    url: text("url"),
    provider: text("provider", { enum: JOB_PROVIDERS }),
    externalId: text("external_id"),
    state: text("state", { enum: JOB_STATES }).notNull().default("none"),
    stateChangedAt: integer("state_changed_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    missedCrawls: integer("missed_crawls").notNull().default(0),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    workType: text("work_type", { enum: PROFILE_WORK_TYPES }),
    salaryLower: integer("salary_lower"),
    salaryUpper: integer("salary_upper"),
    currency: text("currency"),
    experienceRequired: integer("experience_required"),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    links: text("links"),
    deadline: integer("deadline", { mode: "timestamp" }),
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
    index("idx_jobs_company_state").on(table.companyId, table.state),
    index("idx_jobs_state_created").on(table.state, table.createdAt),
    index("idx_jobs_closed_at").on(table.closedAt),
    index("idx_jobs_system_url")
      .on(table.url)
      .where(sql`${table.userId} IS NULL`),
  ],
);

export const tracked_jobs = sqliteTable(
  "tracked_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "no action" }),
    status: text("status", { enum: JOB_STATUS }).notNull().default("saved"),
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .notNull()
      .default(false),
    notes: text("notes"),
    appliedAt: integer("applied_at", { mode: "timestamp" }),
    interviewDate: integer("interview_date", { mode: "timestamp" }),
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

export const trackedJobRelations = relations(tracked_jobs, ({ one }) => ({
  job: one(jobs, {
    fields: [tracked_jobs.jobId],
    references: [jobs.id],
  }),
}));

export const job_topics = sqliteTable(
  "job_topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id")
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
