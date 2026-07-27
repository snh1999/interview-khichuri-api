import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { defaultTimeStamps } from "@/src/database/postgres/schemas/helper";
import {
  EXPERIENCE_LEVELS,
  PROFILE_LINK_TYPES,
  PROFILE_WORK_TYPES,
} from "@/src/profile/profile.dto";

import { user } from "./auth.schema";
import { companies } from "./company.schema";
import { topics, roles, industries } from "./lookups.schema";

export const linkTypeEnum = pgEnum("link_type", PROFILE_LINK_TYPES);

export const workTypeEnum = pgEnum("work_type", PROFILE_WORK_TYPES);

export const experienceLevelEnum = pgEnum(
  "experience_level",
  EXPERIENCE_LEVELS,
);

export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  location: text("location"),
  country: text("country"), // ISO 3166-1 alpha-2 e.g. "US", "BD"
  ...defaultTimeStamps,
});

export const profileRelations = relations(profiles, ({ many }) => ({
  links: many(profile_links),
  workOverviews: many(work_overview),
  workExperiences: many(work_experience),
  educations: many(education),
  resumes: many(resume),
  jobPreferences: many(job_preference),
}));

export const profile_links = pgTable(
  "profile_links",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: linkTypeEnum("type").notNull(),
    url: text("url").notNull(),
  },
  (table) => [
    index("idx_profile_links_profile_id").on(table.profileId),
    unique("idx_profile_links_unique").on(table.profileId, table.type),
  ],
);

export const profileLinkRelations = relations(profile_links, ({ one }) => ({
  profile: one(profiles, {
    fields: [profile_links.profileId],
    references: [profiles.id],
  }),
}));

export const work_overview = pgTable("work_overview", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  experienceLevel: experienceLevelEnum("experience_level"),
  yearsOfExperience: integer("years_of_experience"),
  ...defaultTimeStamps,
});

export const workOverviewRelations = relations(
  work_overview,
  ({ one, many }) => ({
    profile: one(profiles, {
      fields: [work_overview.profileId],
      references: [profiles.id],
    }),
    skills: many(work_skills),
    industries: many(work_industries),
  }),
);

export const work_skills = pgTable(
  "work_skills",
  {
    id: serial("id").primaryKey(),
    workId: integer("work_id")
      .notNull()
      .references(() => work_overview.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_overview_skills_overview_id").on(table.workId),
    unique("idx_overview_skills_unique").on(table.workId, table.topicId),
  ],
);

export const workSkillRelations = relations(work_skills, ({ one }) => ({
  overview: one(work_overview, {
    fields: [work_skills.workId],
    references: [work_overview.id],
  }),
  topic: one(topics, {
    fields: [work_skills.topicId],
    references: [topics.id],
  }),
}));

export const work_industries = pgTable(
  "work_industries",
  {
    id: serial("id").primaryKey(),
    workId: integer("work_id")
      .notNull()
      .references(() => work_overview.id, { onDelete: "cascade" }),
    industryId: integer("industry_id")
      .notNull()
      .references(() => industries.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_overview_industries_overview_id").on(table.workId),
    unique("idx_overview_industries_unique").on(table.workId, table.industryId),
  ],
);

export const workIndustryRelations = relations(work_industries, ({ one }) => ({
  overview: one(work_overview, {
    fields: [work_industries.workId],
    references: [work_overview.id],
  }),
  industry: one(industries, {
    fields: [work_industries.industryId],
    references: [industries.id],
  }),
}));

export const work_experience = pgTable(
  "work_experience",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    isCurrent: boolean("is_current").default(false).notNull(),
    responsibilities: text("responsibilities"),
    ...defaultTimeStamps,
  },
  (table) => [index("idx_work_experience_profile_id").on(table.profileId)],
);

export const workExperienceRelations = relations(
  work_experience,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [work_experience.profileId],
      references: [profiles.id],
    }),
    company: one(companies, {
      fields: [work_experience.companyId],
      references: [companies.id],
    }),
  }),
);

export const education = pgTable(
  "education",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    degreeName: text("degree_name").notNull(),
    fieldOfStudy: text("field_of_study"),
    institution: text("institution").notNull(),
    country: text("country"), // ISO 3166-1 alpha-2
    startDate: timestamp("start_date"),
    graduationDate: timestamp("graduation_date"),
    notes: text("notes"),
    ...defaultTimeStamps,
  },
  (table) => [index("idx_education_profile_id").on(table.profileId)],
);

export const educationRelations = relations(education, ({ one }) => ({
  profile: one(profiles, {
    fields: [education.profileId],
    references: [profiles.id],
  }),
}));

export const job_preference = pgTable("job_preference", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  workType: workTypeEnum("work_type"),
  salaryLower: integer("salary_lower"),
  salaryExpected: integer("salary_expected"),
  currency: text("currency").default("USD"), // ISO 4217
  preferredLocation: text("preferred_location"),
  coverLetterTone: text("cover_letter_tone"),
  coverLetterTemplate: text("cover_letter_template"),
  ...defaultTimeStamps,
});

export const jobPreferenceRelations = relations(
  job_preference,
  ({ one, many }) => ({
    profile: one(profiles, {
      fields: [job_preference.profileId],
      references: [profiles.id],
    }),
    titles: many(preference_titles),
  }),
);

export const preference_titles = pgTable(
  "preference_titles",
  {
    id: serial("id").primaryKey(),
    preferenceId: uuid("preference_id")
      .notNull()
      .references(() => job_preference.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_preference_titles_preference_id").on(table.preferenceId),
    unique("idx_preference_titles_unique").on(table.preferenceId, table.roleId),
  ],
);

export const preferenceTitleRelations = relations(
  preference_titles,
  ({ one }) => ({
    preference: one(job_preference, {
      fields: [preference_titles.preferenceId],
      references: [job_preference.id],
    }),
    role: one(roles, {
      fields: [preference_titles.roleId],
      references: [roles.id],
    }),
  }),
);

export const resume = pgTable(
  "resume",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...defaultTimeStamps,
  },
  (table) => [index("idx_resume_profile_id").on(table.profileId)],
);

export const resumeRelations = relations(resume, ({ one }) => ({
  profile: one(profiles, {
    fields: [resume.profileId],
    references: [profiles.id],
  }),
}));
