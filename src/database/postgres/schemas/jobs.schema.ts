import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";

import { user } from "./auth.schema";

export const statusEnum = pgEnum("status", ["applied", "saved", "scheduled"]);

export const jobSchema = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: statusEnum("status").notNull().default("saved"),
    roleId: integer("role_id").references(() => roleSchema.id, {
      onDelete: "set null",
    }),
    topicId: integer("topic_id").references(() => topicSchema.id, {
      onDelete: "set null",
    }),
    deadline: timestamp("deadline"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("job_creator_index").on(table.userId),
    index("idx_jobs_title_fts").using(
      "gist",
      sql`to_tsvector('english', ${table.title})`,
    ),
    index("idx_jobs_full_fts").using(
      "gist",
      sql`to_tsvector('english', coalesce(${table.title},'') || ' ' || coalesce(${table.description},''))`,
    ),
  ],
);

export const roleSchema = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    isApproved: boolean("isApproved"),
  },
  (table) => [
    index("idx_roles_title_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  ],
);

export const topicSchema = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    isApproved: boolean("isApproved"),
  },
  (table) => [
    index("idx_topics_title_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  ],
);
