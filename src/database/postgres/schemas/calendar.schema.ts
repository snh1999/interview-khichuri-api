import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "@/src/database/postgres/schemas/auth.schema";
import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";

export const calendar_events = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
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
