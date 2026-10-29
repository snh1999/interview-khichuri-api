import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";

export const notes = sqliteTable(
  "notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    title: text("title").notNull(),
    details: text("details"),
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .notNull()
      .default(false),
    ...defaultTimeStamps,
  },
  (table) => [index("idx_notes_user_id").on(table.userId)],
);
