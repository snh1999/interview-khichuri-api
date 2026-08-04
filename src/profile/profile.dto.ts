import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const PROFILE_LINK_TYPES = [
  "github",
  "gitlab",
  "linkedin",
  "portfolio",
  "blog",
  "scholar",
  "other",
] as const;

export const PROFILE_WORK_TYPES = ["remote", "hybrid", "onsite"] as const;

export const EXPERIENCE_LEVELS = [
  "junior",
  "mid",
  "senior",
  "lead",
  "executive",
] as const;

export const PROJECT_TYPES = ["project", "research"] as const;

export const linkTypeSchema = z.enum(PROFILE_LINK_TYPES);

export const projectTypeSchema = z.enum(PROJECT_TYPES);

export const workTypeSchema = z.enum(PROFILE_WORK_TYPES);

export const experienceLevelSchema = z.enum(EXPERIENCE_LEVELS);

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim(),
  phone: z.string().nullish(),
  email: z.email().nullish(),
  location: z.string().nullish(),
  country: z.string().length(2).nullish(),
});

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}

export const workOverviewSchema = z.object({
  title: z.string().trim().min(1),
  experienceLevel: experienceLevelSchema.nullish(),
  yearsOfExperience: z.number().int().min(0).nullish(),
  skills: z.array(z.number().int().positive()).nullish(),
  industries: z.array(z.number().int().positive()).nullish(),
});

export class WorkOverviewDto extends createZodDto(workOverviewSchema) {}

export const workExperienceSchema = z.object({
  id: z.uuid().optional(),
  company: z.string().trim().min(1),
  companyId: z.number().int().positive().nullish(),
  title: z.string().trim().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullish(),
  isCurrent: z.boolean(),
  responsibilities: z.string().nullish(),
});

export class UpdateWorkExperienceDto extends createZodDto(
  z.object({ experiences: z.array(workExperienceSchema) }),
) {}

export const educationSchema = z.object({
  id: z.uuid().optional(),
  degreeName: z.string().trim().min(1),
  fieldOfStudy: z.string().nullish(),
  institution: z.string().trim().min(1),
  country: z.string().nullish(),
  startDate: z.coerce.date().nullish(),
  graduationDate: z.coerce.date().nullish(),
  notes: z.string().nullish(),
});

export class EducationDto extends createZodDto(
  z.object({ education: z.array(educationSchema) }),
) {}

export const jobPreferenceSchema = z.object({
  workType: workTypeSchema.nullish(),
  salaryLower: z.number().int().min(0).nullish(),
  salaryExpected: z.number().int().min(0).nullish(),
  currency: z.string().length(3).nullish(),
  preferredLocation: z.string().nullish(),
  coverLetterTone: z.string().nullish(),
  coverLetterTemplate: z.string().nullish(),
  titles: z.array(z.number().int().positive()).nullish(),
});

export class UpdateJobPreferenceDto extends createZodDto(
  jobPreferenceSchema.refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}

export const profileLinkSchema = z.object({
  type: linkTypeSchema,
  url: z.url(),
});

export class ProfileLinksDto extends createZodDto(
  z.object({ links: z.array(profileLinkSchema) }),
) {}

export const publicationSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().nullish(),
  link: z.url().nullish(),
  year: z.number().int().nullish(),
  publicationType: z.string().trim().nullish(),
});

export class PublicationsDto extends createZodDto(
  z.object({ publications: z.array(publicationSchema) }),
) {}

export const projectSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  type: projectTypeSchema.default("project"),
  description: z.string().nullish(),
  link: z.url().nullish(),
  skills: z.array(z.number().int().positive()).optional(),
});

export class ProjectsDto extends createZodDto(
  z.object({ projects: z.array(projectSchema) }),
) {}

export const referenceSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  title: z.string().trim().nullish(),
  company: z.string().trim().nullish(),
  email: z.email().nullish(),
  phone: z.string().nullish(),
  relationType: z.string().trim().nullish(),
  notes: z.string().nullish(),
});

export class ReferencesDto extends createZodDto(
  z.object({ references: z.array(referenceSchema) }),
) {}

export const activitySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  organization: z.string().nullish(),
  position: z.string().nullish(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  isCurrent: z.boolean(),
  notes: z.string().nullish(),
});

export class ActivitiesDto extends createZodDto(
  z.object({ activities: z.array(activitySchema) }),
) {}
