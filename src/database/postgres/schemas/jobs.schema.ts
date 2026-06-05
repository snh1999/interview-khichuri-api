import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  pgEnum,
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
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    deadline: timestamp("deadline"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("job_creator_index").on(table.userId)],
);
