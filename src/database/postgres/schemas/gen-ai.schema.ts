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
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

export const providerEnum = pgEnum("provider", GEN_AI_PROVIDERS);

export const api_key = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    key: text("key").notNull(),
    isActive: boolean("is_active"),
    model: text("model"),
    ...defaultTimeStamps,
  },
  (table) => [
    uniqueIndex("idx_active_api_key")
      .on(table.provider, table.userId)
      .where(sql`${table.isActive} = true`),
  ],
);
