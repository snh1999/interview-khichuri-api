import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";

import { topics, roles } from "./lookups.schema";

export const jobs = sqliteTable("jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  userId: text("user_id"),
  description: text("description").notNull(),
  status: text("status", { enum: ["applied", "saved", "scheduled"] })
    .notNull()
    .default("saved"),
  roleId: integer("role_id").references(() => roles.id, {
    onDelete: "set null",
  }),
  links: text("links"),
  notes: text("notes"),
  deadline: integer("deadline", { mode: "timestamp" }),
  ...defaultTimeStamps,
});

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
