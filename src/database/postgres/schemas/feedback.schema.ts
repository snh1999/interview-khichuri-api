import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "@/src/database/postgres/schemas/auth.schema";
import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    message: text("message").notNull(),
    route: text("route").notNull(),
    userAgent: text("user_agent"),
    status: text("status"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_feedback_type_created").on(table.type, table.createdAt.desc()),
    index("idx_feedback_status").on(table.status),
    index("idx_feedback_user").on(table.userId),
  ],
);
