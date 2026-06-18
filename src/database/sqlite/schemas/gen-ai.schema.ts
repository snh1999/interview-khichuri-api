import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  uniqueIndex,
  integer,
} from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";

export const api_key = sqliteTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    userId: text("user_id"),
    platform: text("platform", { enum: ["google", "openai"] }).notNull(),
    key: text("key").notNull(),
    isActive: integer("is_active", { mode: "boolean" }),
    ...defaultTimeStamps,
  },
  (table) => [
    uniqueIndex("idx_active_api_key")
      .on(table.platform, table.userId)
      .where(sql`${table.isActive} = 1`),
  ],
);
