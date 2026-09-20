import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";

export const calendar_events = sqliteTable(
  "calendar_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    startDate: integer("start_date", { mode: "timestamp" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp" }).notNull(),
    source: text("source").notNull().default("custom"),
    sourceId: text("source_id"),
    color: text("color"),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_cal_events_user").on(table.userId),
    index("idx_cal_events_source").on(table.source, table.sourceId),
  ],
);
