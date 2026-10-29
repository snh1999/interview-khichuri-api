import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "@/src/database/postgres/schemas/auth.schema";
import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    details: text("details"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    ...defaultTimeStamps,
  },
  (table) => [index("idx_notes_user_id").on(table.userId)],
);

export const noteRelations = relations(notes, ({ one }) => ({
  user: one(user, {
    fields: [notes.userId],
    references: [user.id],
  }),
}));
