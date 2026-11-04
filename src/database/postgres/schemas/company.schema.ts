import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { COMPANY_PROVIDERS } from "@/src/database/database.constants";

export const companyProviderEnum = pgEnum(
  "company_provider",
  COMPANY_PROVIDERS,
);

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  aliases: text("aliases").array(),
  links: jsonb("links"),
  careerPageUrl: text("career_page_url"),
  researchDossier: jsonb("research_dossier"),
  provider: companyProviderEnum("provider"),
  enabled: boolean("enabled").notNull().default(false),
  atsBoardId: text("ats_board_id"),
  feed: jsonb("feed"),
  hash: text("hash"),
  crawledAt: timestamp("crawled_at"),
  crawlError: text("crawl_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
