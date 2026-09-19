import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  SHORT_LENGTH,
  TINY_LENGTH,
  str,
  dateStr,
} from "@/src/common/validation";
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

export const omitDate = { startDate: true, endDate: true } as const;
export const extendDate = { startDate: dateStr, endDate: dateStr } as const;

const publicationExtractionSchema = publicationSchema
  .omit({ id: true })
  .partial();

const projectExtractionSchema = projectSchema
  .omit({ id: true, skills: true })
  .extend({ skills: z.array(str(TINY_LENGTH)).default([]) })
  .partial();

const referenceExtractionSchema = referenceSchema
  .omit({ id: true })
  .extend({ email: z.string().nullish() })
  .partial();

const activityExtractionSchema = activitySchema.omit({ id: true }).partial();

export const extractedProfileSchema = z.object({
  personal: updateProfileSchema.partial(),
  professional: workOverviewSchema
    .omit({ skills: true, industries: true })
    .extend({
      skills: z.array(str(TINY_LENGTH)).nullish(),
      industries: z.array(str(SHORT_LENGTH)).nullish(),
    })
    .partial(),
  workExperience: z
    .array(
      workExperienceSchema
        .omit({ id: true, companyId: true, ...omitDate })
        .extend(extendDate)
        .partial(),
    )
    .default([]),
  education: z
    .array(
      educationSchema
        .omit({ id: true, ...omitDate })
        .extend(extendDate)
        .partial(),
    )
    .default([]),
  preferences: jobPreferenceSchema
    .omit({ coverLetterTone: true, coverLetterTemplate: true, titles: true })
    .extend({ titles: z.array(str(SHORT_LENGTH)).default([]) })
    .partial(),
  links: z.array(profileLinkSchema.partial()).default([]),
  publications: z.array(publicationExtractionSchema.partial()).default([]),
  projects: z.array(projectExtractionSchema.partial()).default([]),
  references: z.array(referenceExtractionSchema.partial()).default([]),
  activities: z
    .array(activityExtractionSchema.omit(omitDate).extend(extendDate).partial())
    .default([]),
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
  template: str(TINY_LENGTH).optional(),
});

export class CreateResumeDto extends createZodDto(createResumeSchema) {}

export const updateResumeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  content: resumeContentSchema.optional(),
  template: str(TINY_LENGTH).optional(),
  isPublic: z.boolean().optional(),
});

export class UpdateResumeDto extends createZodDto(updateResumeSchema) {}

export const RESUME_TEMPLATES = [
  "professional",
  "minimal",
  "technical",
] as const;
