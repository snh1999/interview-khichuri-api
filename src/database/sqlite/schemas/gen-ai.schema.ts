import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  uniqueIndex,
  integer,
} from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

export const api_key = sqliteTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    userId: text("user_id"),
    provider: text("provider", {
      enum: GEN_AI_PROVIDERS,
    }).notNull(),
    key: text("key").notNull(),
    isActive: integer("is_active", { mode: "boolean" }),
    model: text("model"),
    ...defaultTimeStamps,
  },
  (table) => [
    uniqueIndex("idx_active_api_key")
      .on(table.provider, table.userId)
      .where(sql`${table.isActive} = 1`),
  ],
);
