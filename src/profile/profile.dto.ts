import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  LARGE_LENGTH,
  MID_LENGTH,
  SHORT_LENGTH,
  TINY_LENGTH,
  URL_LENGTH,
  nullishStr,
  requiredStr,
  str,
} from "@/src/common/validation";

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
  firstName: requiredStr(SHORT_LENGTH),
  lastName: str(SHORT_LENGTH),
  phone: nullishStr(TINY_LENGTH),
  email: z.email().nullish(),
  location: nullishStr(SHORT_LENGTH),
  country: nullishStr(SHORT_LENGTH),
});

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}

export const workOverviewSchema = z.object({
  title: requiredStr(SHORT_LENGTH),
  experienceLevel: experienceLevelSchema.nullish(),
  yearsOfExperience: z.number().int().min(0).nullish(),
  skills: z.array(z.number().int().positive()).nullish(),
  industries: z.array(z.number().int().positive()).nullish(),
});

export class WorkOverviewDto extends createZodDto(workOverviewSchema) {}

export const workExperienceSchema = z.object({
  id: z.uuid().optional(),
  company: requiredStr(SHORT_LENGTH),
  companyId: z.number().int().positive().nullish(),
  title: requiredStr(MID_LENGTH),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullish(),
  isCurrent: z.boolean(),
  responsibilities: nullishStr(),
});

const filterEndDate = (
  data: { isCurrent: boolean; endDate?: Date | null }[],
): boolean =>
  data.every(
    (item) =>
      !item.isCurrent || item.endDate === null || item.endDate === undefined,
  );

export class UpdateWorkExperienceDto extends createZodDto(
  z.object({
    experiences: z.array(workExperienceSchema).refine(filterEndDate, {
      message: "endDate must not be set when isCurrent is true",
    }),
  }),
) {}

export const educationSchema = z.object({
  id: z.uuid().optional(),
  degreeName: requiredStr(SHORT_LENGTH),
  fieldOfStudy: nullishStr(),
  institution: requiredStr(MID_LENGTH),
  location: nullishStr(SHORT_LENGTH),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  isCurrent: z.boolean(),
  notes: nullishStr(),
});

export class EducationDto extends createZodDto(
  z.object({
    education: z.array(educationSchema).refine(filterEndDate, {
      message: "endDate must not be set when isCurrent is true",
    }),
  }),
) {}

export const jobPreferenceSchema = z.object({
  workType: workTypeSchema.nullish(),
  salaryLower: z.number().int().min(0).nullish(),
  salaryExpected: z.number().int().min(0).nullish(),
  currency: z.string().length(3).nullish(),
  preferredLocation: nullishStr(SHORT_LENGTH),
  coverLetterTone: nullishStr(),
  coverLetterTemplate: nullishStr(),
  titles: z.array(z.number().int().positive()).nullish(),
});

export class UpdateJobPreferenceDto extends createZodDto(
  jobPreferenceSchema.refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}

export const profileLinkSchema = z.object({
  type: linkTypeSchema,
  url: z.url().max(URL_LENGTH),
});

export class ProfileLinksDto extends createZodDto(
  z.object({ links: z.array(profileLinkSchema) }),
) {}

export const publicationSchema = z.object({
  id: z.number().int().positive().optional(),
  title: requiredStr(MID_LENGTH),
  authors: z.array(requiredStr(MID_LENGTH)).optional(),
  notes: nullishStr(LARGE_LENGTH),
  link: z.url().max(URL_LENGTH).nullish(),
  year: z.number().int().nullish(),
  publicationType: nullishStr(MID_LENGTH),
});

export class PublicationsDto extends createZodDto(
  z.object({ publications: z.array(publicationSchema) }),
) {}

export const projectSchema = z.object({
  id: z.number().int().positive().optional(),
  name: requiredStr(SHORT_LENGTH),
  type: projectTypeSchema.optional(),
  description: nullishStr(),
  link: z.url().max(URL_LENGTH).nullish(),
  skills: z.array(z.number().int().positive()).optional(),
});

export class ProjectsDto extends createZodDto(
  z.object({ projects: z.array(projectSchema) }),
) {}

export const referenceSchema = z.object({
  id: z.number().int().positive().optional(),
  name: requiredStr(SHORT_LENGTH),
  title: nullishStr(SHORT_LENGTH),
  company: nullishStr(SHORT_LENGTH),
  email: z.email().nullish(),
  phone: nullishStr(TINY_LENGTH),
  relationType: nullishStr(),
  notes: nullishStr(LARGE_LENGTH),
});

export class ReferencesDto extends createZodDto(
  z.object({ references: z.array(referenceSchema) }),
) {}

export const activitySchema = z.object({
  id: z.number().int().positive().optional(),
  name: requiredStr(MID_LENGTH),
  organization: nullishStr(SHORT_LENGTH),
  position: nullishStr(SHORT_LENGTH),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  isCurrent: z.boolean(),
  notes: nullishStr(),
});

export class ActivitiesDto extends createZodDto(
  z.object({
    activities: z.array(activitySchema).refine(filterEndDate, {
      message: "endDate must not be set when isCurrent is true",
    }),
  }),
) {}
