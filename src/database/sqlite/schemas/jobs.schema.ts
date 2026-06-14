import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
});

export const job_topics = sqliteTable("job_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  topicId: integer("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
});

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
