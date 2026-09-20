import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";

import { jobs } from "./jobs.schema";
import { roles, topics } from "./lookups.schema";

export const prep_session = sqliteTable(
  "prep_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    experience: text("experience"),
    description: text("description"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_session_user_id").on(table.userId),
    index("idx_job_session").on(table.jobId),
    index("idx_session_fav_created").on(table.isFavorite, table.createdAt),
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
    .references(() => prep_session.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  answer: text("answer"),
  notes: text("notes"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  ...defaultTimeStamps,
});

export const sessionRelations = relations(prep_session, ({ one, many }) => ({
  sessionTopics: many(session_topics),
  questions: many(questions),
  interviews: many(interviews),
  job: one(jobs, {
    fields: [prep_session.jobId],
    references: [jobs.id],
  }),
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

export const interviews = sqliteTable(
  "interviews",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id")
      .notNull()
      .references(() => prep_session.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    mode: text("mode", { enum: ["qa_flow", "interview_flow"] })
      .default("qa_flow")
      .notNull(),
    focusTypes: text("focus_types", { mode: "json" }).$type<string[]>(),
    topicNames: text("topic_names", { mode: "json" }).$type<string[]>(),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    overallScore: integer("overall_score"),
    technicalScore: integer("technical_score"),
    communicationScore: integer("communication_score"),
    problemSolvingScore: integer("problem_solving_score"),
    leadershipFitScore: integer("leadership_fit_score"),
    elapsedSeconds: integer("elapsed_seconds"),
    summaryMarkdown: text("summary_markdown"),
    strengths: text("strengths", { mode: "json" }).$type<string[]>(),
    improvements: text("improvements", { mode: "json" }).$type<string[]>(),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_interview_session_id").on(table.sessionId),
    index("idx_interview_user_id").on(table.userId),
  ],
);

export const interviewRelations = relations(interviews, () => ({}));
