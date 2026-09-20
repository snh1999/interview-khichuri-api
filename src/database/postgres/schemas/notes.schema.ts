import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "@/src/database/postgres/schemas/auth.schema";
import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";
import { jobs } from "@/src/database/postgres/schemas/jobs.schema";
import { questions } from "@/src/database/postgres/schemas/prepSession.schema";

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    questionId: integer("question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    jobId: uuid("job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    details: text("details"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_notes_user_id").on(table.userId),
    index("idx_notes_question_id").on(table.questionId),
    index("idx_notes_job_id").on(table.jobId),
    check(
      "notes_single_attachment_invariant",
      sql`(${table.questionId} IS NULL OR ${table.jobId} IS NULL)`,
    ),
  ],
);

export const noteRelations = relations(notes, ({ one }) => ({
  user: one(user, {
    fields: [notes.userId],
    references: [user.id],
  }),
  question: one(questions, {
    fields: [notes.questionId],
    references: [questions.id],
  }),
  job: one(jobs, {
    fields: [notes.jobId],
    references: [jobs.id],
  }),
}));
