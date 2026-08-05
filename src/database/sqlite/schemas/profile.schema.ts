import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import { defaultTimeStamps } from "@/src/database/sqlite/schemas/helpers";
import {
  EXPERIENCE_LEVELS,
  PROFILE_LINK_TYPES,
  PROFILE_WORK_TYPES,
  PROJECT_TYPES,
} from "@/src/profile/profile.dto";

import { companies } from "./company.schema";
import { topics, roles, industries } from "./lookups.schema";

export const profiles = sqliteTable("profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  location: text("location"),
  country: text("country"), // ISO 3166-1 alpha-2 e.g. "US", "BD"
  ...defaultTimeStamps,
});

export const profile_links = sqliteTable(
  "profile_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: PROFILE_LINK_TYPES,
    }).notNull(),
    url: text("url").notNull(),
  },
  (table) => [
    index("idx_profile_links_profile_id").on(table.profileId),
    unique("idx_profile_links_unique").on(table.profileId, table.type),
  ],
);

export const profileRelations = relations(profiles, ({ many }) => ({
  links: many(profile_links),
  workOverviews: many(work_overview),
  workExperiences: many(work_experience),
  educations: many(education),
  resumes: many(resume),
  jobPreferences: many(job_preference),
  publications: many(publications),
  projects: many(projects),
  references: many(references),
  activities: many(activities),
}));

export const profileLinkRelations = relations(profile_links, ({ one }) => ({
  profile: one(profiles, {
    fields: [profile_links.profileId],
    references: [profiles.id],
  }),
}));

export const work_overview = sqliteTable("work_overview", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  experienceLevel: text("experience_level", {
    enum: EXPERIENCE_LEVELS,
  }),
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

export const work_skills = sqliteTable(
  "work_skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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

export const work_industries = sqliteTable(
  "work_industries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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

export const work_experience = sqliteTable(
  "work_experience",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    startDate: integer("start_date", { mode: "timestamp" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp" }),
    isCurrent: integer("is_current", { mode: "boolean" })
      .default(false)
      .notNull(),
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

export const education = sqliteTable(
  "education",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    degreeName: text("degree_name").notNull(),
    fieldOfStudy: text("field_of_study"),
    institution: text("institution").notNull(),
    country: text("country"), // ISO 3166-1 alpha-2
    startDate: integer("start_date", { mode: "timestamp" }),
    graduationDate: integer("graduation_date", { mode: "timestamp" }),
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

export const job_preference = sqliteTable("job_preference", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  workType: text("work_type", { enum: PROFILE_WORK_TYPES }),
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

export const preference_titles = sqliteTable(
  "preference_titles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    preferenceId: text("preference_id")
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

export const resume = sqliteTable(
  "resume",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url"),
    content: text("content"),
    template: text("template"),
    isPublic: integer("is_public", { mode: "boolean" })
      .default(false)
      .notNull(),
    slug: text("slug"),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .default(false)
      .notNull(),
    ...defaultTimeStamps,
  },
  (table) => [
    index("idx_resume_profile_id").on(table.profileId),
    unique("idx_resume_slug").on(table.slug),
  ],
);

export const resumeRelations = relations(resume, ({ one }) => ({
  profile: one(profiles, {
    fields: [resume.profileId],
    references: [profiles.id],
  }),
}));

export const publications = sqliteTable(
  "publications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    authors: text("authors").notNull().default("[]"),
    notes: text("notes"),
    link: text("link"),
    year: integer("year"),
    publicationType: text("publication_type"),
  },
  (table) => [index("idx_publications_profile_id").on(table.profileId)],
);

export const publicationRelations = relations(publications, ({ one }) => ({
  profile: one(profiles, {
    fields: [publications.profileId],
    references: [profiles.id],
  }),
}));

export const projects = sqliteTable(
  "projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: PROJECT_TYPES,
    })
      .notNull()
      .default("project"),
    description: text("description"),
    link: text("link"),
  },
  (table) => [index("idx_projects_profile_id").on(table.profileId)],
);

export const projectRelations = relations(projects, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [projects.profileId],
    references: [profiles.id],
  }),
  skills: many(project_skills),
}));

export const project_skills = sqliteTable(
  "project_skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_project_skills_project_id").on(table.projectId),
    unique("idx_project_skills_unique").on(table.projectId, table.topicId),
  ],
);

export const projectSkillRelations = relations(project_skills, ({ one }) => ({
  project: one(projects, {
    fields: [project_skills.projectId],
    references: [projects.id],
  }),
  topic: one(topics, {
    fields: [project_skills.topicId],
    references: [topics.id],
  }),
}));

export const references = sqliteTable(
  "references",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    relationType: text("relation_type"),
    notes: text("notes"),
  },
  (table) => [index("idx_references_profile_id").on(table.profileId)],
);

export const referenceRelations = relations(references, ({ one }) => ({
  profile: one(profiles, {
    fields: [references.profileId],
    references: [profiles.id],
  }),
}));

export const activities = sqliteTable(
  "activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    organization: text("organization"),
    position: text("position"),
    startDate: integer("start_date", { mode: "timestamp" }),
    endDate: integer("end_date", { mode: "timestamp" }),
    isCurrent: integer("is_current", { mode: "boolean" })
      .default(false)
      .notNull(),
    notes: text("notes"),
  },
  (table) => [index("idx_activities_profile_id").on(table.profileId)],
);

export const activityRelations = relations(activities, ({ one }) => ({
  profile: one(profiles, {
    fields: [activities.profileId],
    references: [profiles.id],
  }),
}));
