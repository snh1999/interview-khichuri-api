import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/src/database/postgres/schemas/auth.schema";
import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";
import { PROMPT_TYPES } from "@/src/gen-ai/prompts/prompts.dto";

export const promptTypeEnum = pgEnum("prompt_type", PROMPT_TYPES);

export const prompts = pgTable(
  "prompts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    prompt: text("prompt").notNull(),
    type: promptTypeEnum("type").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    likeCount: integer("like_count").default(0).notNull(),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_prompts_public_type").on(table.isPublic, table.type),
    index("idx_prompts_likes").on(table.likeCount),
    index("idx_prompts_user").on(table.userId),
  ],
);

export const prompt_likes = pgTable(
  "prompt_likes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    promptId: integer("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    createdAt: defaultTimeStamps.createdAt,
  },
  (table) => [
    uniqueIndex("idx_prompt_likes_user_prompt").on(
      table.userId,
      table.promptId,
    ),
  ],
);

export const user_default_prompts = pgTable(
  "user_default_prompts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    type: promptTypeEnum("type").notNull(),
    promptId: integer("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("idx_default_prompts_user_type").on(table.userId, table.type),
  ],
);

export const promptLikesRelations = relations(prompt_likes, ({ one }) => ({
  prompt: one(prompts, {
    fields: [prompt_likes.promptId],
    references: [prompts.id],
  }),
}));

export const defaultPromptRelations = relations(
  user_default_prompts,
  ({ one }) => ({
    prompt: one(prompts, {
      fields: [user_default_prompts.promptId],
      references: [prompts.id],
    }),
  }),
);
