import { relations, sql } from "drizzle-orm";
import { boolean, index, pgTable, serial, text } from "drizzle-orm/pg-core";

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
  },
  (table) => [
    index("idx_topics_name_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  ],
);

export const topicRelations = relations(topics, ({ many }) => ({
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
