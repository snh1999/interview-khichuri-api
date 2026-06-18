import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  uuid,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/src/database/postgres/schemas/auth.schema";
import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";

export const platformEnum = pgEnum("platform", ["google", "openai"]);

export const api_key = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    key: text("key").notNull(),
    isActive: boolean("is_active"),
    ...defaultTimeStamps,
  },
  (table) => [
    uniqueIndex("idx_active_api_key")
      .on(table.platform, table.userId)
      .where(sql`${table.isActive} = true`),
  ],
);
