import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const linkTypeSchema = z.enum([
  "github",
  "gitlab",
  "linkedin",
  "portfolio",
  "blog",
  "other",
]);

export const workTypeSchema = z.enum(["remote", "hybrid", "onsite"]);

export const experienceLevelSchema = z.enum([
  "junior",
  "mid",
  "senior",
  "lead",
  "executive",
]);

export const UpdateProfileSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim(),
  phone: z.string().optional(),
  email: z.email().optional(),
  location: z.string().optional(),
  country: z.string().length(2).optional(),
});

export class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}

export const UpdateWorkOverviewSchema = z.object({
  title: z.string().trim().min(1),
  experienceLevel: experienceLevelSchema.optional(),
  yearsOfExperience: z.number().int().min(0).optional(),
  skills: z.array(z.number().int().positive()).optional(),
  industries: z.array(z.number().int().positive()).optional(),
});

export class UpdateWorkOverviewDto extends createZodDto(
  UpdateWorkOverviewSchema,
) {}

const WorkExperienceEntrySchema = z
  .object({
    id: z.uuid().optional(),
    company: z.string().trim().min(1),
    companyId: z.number().int().positive().optional(),
    title: z.string().trim().min(1),
    startDate: z.string().min(1),
    endDate: z.string().optional(),
    isCurrent: z.boolean(),
    responsibilities: z.string().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  });

export const UpdateWorkExperienceSchema = z.array(WorkExperienceEntrySchema);

export class UpdateWorkExperienceDto extends createZodDto(
  z.object({ experiences: UpdateWorkExperienceSchema }),
) {}

const EducationEntrySchema = z.object({
  id: z.uuid().optional(),
  degreeName: z.string().trim().min(1),
  fieldOfStudy: z.string().optional(),
  institution: z.string().trim().min(1),
  country: z.string().optional(),
  startDate: z.string().optional(),
  graduationDate: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateEducationSchema = z.array(EducationEntrySchema);

export class UpdateEducationDto extends createZodDto(
  z.object({ education: UpdateEducationSchema }),
) {}

export const UpdateJobPreferenceSchema = z
  .object({
    workType: workTypeSchema.optional(),
    salaryLower: z.number().int().min(0).optional(),
    salaryExpected: z.number().int().min(0).optional(),
    currency: z.string().length(3).optional(),
    preferredLocation: z.string().optional(),
    coverLetterTone: z.string().optional(),
    coverLetterTemplate: z.string().optional(),
    titles: z.array(z.number().int().positive()).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  });

export class UpdateJobPreferenceDto extends createZodDto(
  UpdateJobPreferenceSchema,
) {}

const ProfileLinkEntrySchema = z.object({
  type: linkTypeSchema,
  url: z.url(),
});

export const UpdateProfileLinksSchema = z.array(ProfileLinkEntrySchema);

export class UpdateProfileLinksDto extends createZodDto(
  z.object({ links: UpdateProfileLinksSchema }),
) {}
