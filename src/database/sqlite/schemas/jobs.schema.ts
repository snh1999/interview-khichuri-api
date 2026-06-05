import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  index,
} from "drizzle-orm/sqlite-core";

// SQLite has no native enum — use text with runtime validation
export const jobSchema = sqliteTable("jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["applied", "saved", "scheduled"] })
    .notNull()
    .default("saved"),
  roleId: integer("role_id").references(() => roles.id, {
    onDelete: "set null",
  }),
  deadline: integer("deadline", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
});
