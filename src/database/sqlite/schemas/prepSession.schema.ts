import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import { jobs } from "./jobs.schema";
import { roles, topics } from "./lookups.schema";

export const prep_session = sqliteTable(
  "prep_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    jobId: text("job_id").references(() => jobs.id),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    experience: text("experience"),
    description: text("description"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_session_user_id").on(table.userId),
    index("idx_job_session").on(table.jobId),
  ],
);

export const session_topics = sqliteTable(
  "session_topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => prep_session.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_session_id").on(table.sessionId),
    unique("idx_session_topics_unique").on(table.sessionId, table.topicId),
  ],
);

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => prep_session.id),
  answer: text("answer"),
  notes: text("notes"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
});

export const sessionRelations = relations(prep_session, ({ many }) => ({
  sessionTopics: many(session_topics),
  questions: many(questions),
}));

export const questionRelations = relations(questions, ({ one }) => ({
  session: one(prep_session, {
    fields: [questions.sessionId],
    references: [prep_session.id],
  }),
}));

export const sessionTopicRelations = relations(session_topics, ({ one }) => ({
  session: one(prep_session, {
    fields: [session_topics.sessionId],
    references: [prep_session.id],
  }),
  topic: one(topics, {
    fields: [session_topics.topicId],
    references: [topics.id],
  }),
}));
