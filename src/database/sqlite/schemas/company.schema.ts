import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  ...defaultTimeStamps,
});
