import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";

import { job_topics } from "./jobs.schema";
import { session_topics } from "./prepSession.schema";

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    isApproved: boolean("isApproved"),
  },
  (table) => [
    index("idx_roles_name_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  ],
);

export const topics = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    isApproved: boolean("isApproved"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("idx_topics_name_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  ],
);

export const topicRelations = relations(topics, ({ one, many }) => ({
  category: one(categories, {
    fields: [topics.categoryId],
    references: [categories.id],
  }),
  jobTopics: many(job_topics),
  sessionTopics: many(session_topics),
}));

export const industries = pgTable(
  "industries",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    isApproved: boolean("isApproved"),
  },
  (table) => [
    index("idx_industries_name_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    isApproved: boolean("isApproved"),
  },
  (table) => [
    index("idx_categories_name_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  ],
);

export const categoryRelations = relations(categories, ({ many }) => ({
  topics: many(topics),
}));
