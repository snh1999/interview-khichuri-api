import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.schema";
import { jobs } from "./jobs.schema";
import { roles, topics } from "./lookups.schema";

export const prep_session = pgTable(
  "prep_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    experience: text("experience"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_session_user_id").on(table.userId),
    index("idx_job_session").on(table.jobId),
  ],
);

export const session_topics = pgTable(
  "session_topics",
  {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id")
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

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => prep_session.id),
  answer: text("answer"),
  notes: text("notes"),
  isFavorite: boolean("is_favorite").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
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
