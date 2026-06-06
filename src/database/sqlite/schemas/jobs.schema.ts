import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobSchema = sqliteTable("jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  userId: text("user_id"),
  description: text("description").notNull(),
  status: text("status", { enum: ["applied", "saved", "scheduled"] })
    .notNull()
    .default("saved"),
  roleId: integer("role_id").references(() => roleSchema.id, {
    onDelete: "set null",
  }),
  topicId: integer("topic_id").references(() => topicsSchema.id, {
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

export const roleSchema = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isApproved: integer({ mode: "boolean" }),
});

export const topicsSchema = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isApproved: integer({ mode: "boolean" }),
});
