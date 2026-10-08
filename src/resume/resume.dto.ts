import { z } from "zod";

import {
  LARGE_LENGTH,
  MID_LENGTH,
  SHORT_LENGTH,
  TINY_LENGTH,
  str,
  dateStr,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { aiCommonSchema } from "@/src/gen-ai/gen-ai.constants";
import {
  activitySchema,
  educationSchema,
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

const MAX_SKILL_GROUPS = 5;

const publicationExtractionSchema = publicationSchema
  .omit({ id: true })
  .partial();

const projectExtractionSchema = projectSchema
  .omit({ id: true, skills: true })
  .extend({ skills: z.array(str(TINY_LENGTH)).max(50).default([]) })
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
      skills: z.array(str(TINY_LENGTH)).max(60).nullish(),
      industries: z.array(str(SHORT_LENGTH)).max(30).nullish(),
    })
    .partial(),
  workExperience: z
    .array(
      workExperienceSchema
        .omit({ id: true, companyId: true, ...omitDate })
        .extend(extendDate)
        .partial(),
    )
    .max(30)
    .default([]),
  education: z
    .array(
      educationSchema
        .omit({ id: true, ...omitDate })
        .extend(extendDate)
        .partial(),
    )
    .max(20)
    .default([]),
  links: z.array(profileLinkSchema.partial()).max(20).default([]),
  publications: z
    .array(publicationExtractionSchema.partial())
    .max(30)
    .default([]),
  projects: z.array(projectExtractionSchema.partial()).max(30).default([]),
  references: z.array(referenceExtractionSchema.partial()).max(10).default([]),
  activities: z
    .array(activityExtractionSchema.omit(omitDate).extend(extendDate).partial())
    .max(30)
    .default([]),
});

export type TExtractedProfile = z.infer<typeof extractedProfileSchema>;

export class ExtractResumeDto extends createZodDto(aiCommonSchema) {}

export const resumeContentSchema = z.object({
  personal: updateProfileSchema,
  professional: workOverviewSchema.omit({
    industries: true,
    skills: true,
  }),
  workExperience: z.array(workExperienceSchema),
  education: z.array(educationSchema),
  links: z.array(profileLinkSchema),
  publications: z.array(publicationSchema),
  projects: z.array(
    projectSchema
      .omit({ skills: true })
      .extend({ skills: str(LARGE_LENGTH).optional() }),
  ),
  references: z.array(referenceSchema),
  activities: z.array(activitySchema),
  skillGroups: z
    .array(
      z.object({
        id: z.string().max(36),
        keywords: str(LARGE_LENGTH),
        label: str(SHORT_LENGTH),
      }),
    )
    .max(MAX_SKILL_GROUPS)
    .optional(),
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

const tipSchema = z.object({
  type: z.enum(["good", "improve"]),
  tip: str(MID_LENGTH),
  explanation: str(LARGE_LENGTH),
});

export type TAtsTip = z.infer<typeof tipSchema>;

export const atsScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  categories: z.array(
    z.object({
      key: z.enum([
        "skillsMatch",
        "keywordHitRate",
        "experienceFit",
        "roleAlignment",
      ]),
      score: z.number().min(0).max(100),
      tips: z.array(tipSchema).max(10),
    }),
  ),
  recommendations: z.array(str(MID_LENGTH)).max(15),
  matchedKeywords: z.array(str(SHORT_LENGTH)).max(50),
  missingKeywords: z.array(str(SHORT_LENGTH)).max(50),
  tailoringNotes: z.string(),
});

export type TAtsScore = z.infer<typeof atsScoreSchema>;

export const STANDALONE_CATEGORY_KEYS = [
  "toneAndStyle",
  "content",
  "structure",
  "skills",
] as const;

export const standaloneReviewSchema = z.object({
  overall: z.number().min(0).max(100),
  categories: z.array(
    z.object({
      key: z.enum(STANDALONE_CATEGORY_KEYS),
      score: z.number().min(0).max(100),
      tips: z.array(tipSchema).max(10),
    }),
  ),
});

export type TStandaloneReview = z.infer<typeof standaloneReviewSchema>;

const scoreResumeSchema = aiCommonSchema.extend({
  jobId: z.uuid(),
  resumeId: z.uuid(),
});

export class ScoreResumeDto extends createZodDto(scoreResumeSchema) {}

const reviewStandaloneSchema = aiCommonSchema.extend({
  resumeId: z.uuid(),
});

export class ReviewStandaloneDto extends createZodDto(reviewStandaloneSchema) {}
