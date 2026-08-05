import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";
import {
  activitySchema,
  educationSchema,
  jobPreferenceSchema,
  profileLinkSchema,
  projectSchema,
  publicationSchema,
  referenceSchema,
  updateProfileSchema,
  workOverviewSchema,
  workExperienceSchema,
} from "@/src/profile/profile.dto";

const publicationExtractionSchema = publicationSchema.partial();

const projectExtractionSchema = projectSchema
  .omit({ skills: true })
  .extend({ skills: z.array(z.string()).default([]) })
  .partial();

const referenceExtractionSchema = referenceSchema
  .extend({ email: z.string().nullish() })
  .partial();

const activityExtractionSchema = activitySchema.partial();

export const extractedProfileSchema = z.object({
  personal: updateProfileSchema.partial(),
  professional: workOverviewSchema
    .omit({ skills: true, industries: true })
    .extend({
      skills: z.array(z.string()).nullish(),
      industries: z.array(z.string()).nullish(),
    })
    .partial(),
  workExperience: z
    .array(workExperienceSchema.omit({ id: true, companyId: true }).partial())
    .default([]),
  education: z.array(educationSchema.omit({ id: true }).partial()).default([]),
  preferences: jobPreferenceSchema
    .omit({ coverLetterTone: true, coverLetterTemplate: true, titles: true })
    .extend({ titles: z.array(z.string()).default([]) })
    .partial(),
  links: z.array(profileLinkSchema).default([]),
  publications: z.array(publicationExtractionSchema).default([]),
  projects: z.array(projectExtractionSchema).default([]),
  references: z.array(referenceExtractionSchema).default([]),
  activities: z.array(activityExtractionSchema).default([]),
});

export type TExtractedProfile = z.infer<typeof extractedProfileSchema>;

export type ExtractionResult = Omit<
  TExtractedProfile,
  "professional" | "preferences" | "projects"
> & {
  professional: Omit<
    TExtractedProfile["professional"],
    "skills" | "industries"
  > & {
    skills: number[];
    industries: number[];
  };
  preferences: Omit<TExtractedProfile["preferences"], "titles"> & {
    titles: number[];
  };
  projects: (Omit<TExtractedProfile["projects"][number], "skills"> & {
    skills: number[];
  })[];
};

export const extractResumeSchema = z.object({
  provider: z.enum(GEN_AI_PROVIDERS),
});

export class ExtractResumeDto extends createZodDto(extractResumeSchema) {}

export const resumeContentSchema = z.object({
  personal: updateProfileSchema,
  professional: workOverviewSchema,
  workExperience: z.array(workExperienceSchema),
  education: z.array(educationSchema),
  preferences: jobPreferenceSchema,
  links: z.array(profileLinkSchema),
  publications: z.array(publicationSchema),
  projects: z.array(projectSchema),
  references: z.array(referenceSchema),
  activities: z.array(activitySchema),
});

export type TResumeContent = z.infer<typeof resumeContentSchema>;

export const createResumeSchema = z.object({
  name: z.string().trim().min(1, "Resume name is required").max(100),
  content: resumeContentSchema,
  template: z.string().optional(),
});

export class CreateResumeDto extends createZodDto(createResumeSchema) {}

export const updateResumeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  content: resumeContentSchema.optional(),
  template: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export class UpdateResumeDto extends createZodDto(updateResumeSchema) {}

export const RESUME_TEMPLATES = [
  "professional",
  "minimal",
  "technical",
] as const;
