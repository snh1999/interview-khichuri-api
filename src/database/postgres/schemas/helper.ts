import { timestamp } from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at").defaultNow().notNull();

const updatedAt = timestamp("updated_at")
  .defaultNow()
  .$onUpdate(() => new Date())
  .notNull();

export const defaultTimeStamps = { createdAt, updatedAt };
