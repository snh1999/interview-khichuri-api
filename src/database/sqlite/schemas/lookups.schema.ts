import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { job_topics } from "@/src/database/sqlite/schemas/jobs.schema";
import { session_topics } from "@/src/database/sqlite/schemas/prepSession.schema";

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isApproved: integer({ mode: "boolean" }),
});

export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isApproved: integer({ mode: "boolean" }),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
});

export const topicRelations = relations(topics, ({ one, many }) => ({
  category: one(categories, {
    fields: [topics.categoryId],
    references: [categories.id],
  }),
  jobTopics: many(job_topics),
  sessionTopics: many(session_topics),
}));

export const industries = sqliteTable("industries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isApproved: integer({ mode: "boolean" }),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isApproved: integer({ mode: "boolean" }),
});

export const categoryRelations = relations(categories, ({ many }) => ({
  topics: many(topics),
}));
