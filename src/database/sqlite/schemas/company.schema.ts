import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { COMPANY_PROVIDERS } from "@/src/database/database.constants";
import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  aliases: text("aliases", { mode: "json" }).$type<string[]>(),
  links: text("links", { mode: "json" }).$type<
    {
      type: string;
      url: string;
    }[]
  >(),
  careerPageUrl: text("career_page_url"),
  researchDossier: text("research_dossier", { mode: "json" }).$type<unknown>(),
  provider: text("provider", { enum: COMPANY_PROVIDERS }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  atsBoardId: text("ats_board_id"),
  feed: text("feed", { mode: "json" }).$type<unknown>(),
  hash: text("hash"),
  crawledAt: integer("crawled_at", { mode: "timestamp" }),
  crawlError: text("crawl_error"),
  ...defaultTimeStamps,
});
