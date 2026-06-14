import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";

import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";

import { user } from "./auth.schema";
import { roles, topics } from "./lookups.schema";

export const statusEnum = pgEnum("status", ["applied", "saved", "scheduled"]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: statusEnum("status").notNull().default("saved"),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    links: text("links"), // TODO make array
    notes: text("notes"),
    deadline: timestamp("deadline"),
    ...defaultTimeStamps,
  },
  (table) => [
    index("job_creator_index").on(table.userId),
    index("idx_jobs_title_fts").using(
      "gist",
      sql`to_tsvector('english', ${table.title})`,
    ),
    index("idx_jobs_full_fts").using(
      "gist",
      sql`to_tsvector('english', coalesce(${table.title},'') || ' ' || coalesce(${table.description},''))`,
    ),
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

export const jobRelations = relations(jobs, ({ many }) => ({
  jobTopics: many(job_topics),
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
