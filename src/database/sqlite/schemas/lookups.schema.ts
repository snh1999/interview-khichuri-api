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
});

export const topicRelations = relations(topics, ({ many }) => ({
  jobTopics: many(job_topics),
  sessionTopics: many(session_topics),
}));

export const industries = sqliteTable("industries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isApproved: integer({ mode: "boolean" }),
});
