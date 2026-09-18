import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";
import { jobs } from "@/src/database/sqlite/schemas/jobs.schema";
import { questions } from "@/src/database/sqlite/schemas/prepSession.schema";

export const notes = sqliteTable(
  "notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    questionId: integer("question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    jobId: text("job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    details: text("details"),
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .notNull()
      .default(false),
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
  question: one(questions, {
    fields: [notes.questionId],
    references: [questions.id],
  }),
  job: one(jobs, {
    fields: [notes.jobId],
    references: [jobs.id],
  }),
}));
