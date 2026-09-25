import { relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";
import { PROMPT_TYPES } from "@/src/gen-ai/prompts/prompts.dto";

export const prompts = sqliteTable(
  "prompts",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id"),
    title: text("title").notNull().default(""),
    prompt: text("prompt").notNull(),
    type: text("type", { enum: PROMPT_TYPES }).notNull(),
    isPublic: integer("is_public", { mode: "boolean" })
      .default(false)
      .notNull(),
    likeCount: integer("like_count").default(0).notNull(),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_prompts_public_type").on(table.isPublic, table.type),
    index("idx_prompts_likes").on(table.likeCount),
  ],
);

export const prompt_likes = sqliteTable(
  "prompt_likes",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id"),
    promptId: integer("prompt_id", { mode: "number" }).notNull(),
    createdAt: defaultTimeStamps.createdAt,
  },
  (table) => [uniqueIndex("idx_prompt_likes_prompt").on(table.promptId)],
);

export const user_default_prompts = sqliteTable(
  "user_default_prompts",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id"),
    type: text("type", { enum: PROMPT_TYPES }).notNull(),
    promptId: integer("prompt_id", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("idx_default_prompts_type").on(table.type)],
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
