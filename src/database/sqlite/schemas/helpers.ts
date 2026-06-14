import { sql } from "drizzle-orm";
import { integer } from "drizzle-orm/sqlite-core";

const createdAt = integer("created_at", { mode: "timestamp" })
  .notNull()
  .default(sql`(unixepoch())`);

const updatedAt = integer("updated_at", { mode: "timestamp" })
  .notNull()
  .default(sql`(unixepoch())`)
  .$onUpdate(() => sql`(unixepoch())`);

export const defaultTimeStamps = { createdAt, updatedAt };
