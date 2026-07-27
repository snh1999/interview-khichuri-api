import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";
import {
  educationSchema,
  jobPreferenceSchema,
  profileLinkSchema,
  updateProfileSchema,
  workOverviewSchema,
  workExperienceSchema,
} from "@/src/profile/profile.dto";

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
});

export type TExtractedProfile = z.infer<typeof extractedProfileSchema>;

export type ExtractionResult = Omit<
  TExtractedProfile,
  "professional" | "preferences"
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
};

export const extractResumeSchema = z.object({
  provider: z.enum(GEN_AI_PROVIDERS),
});

export class ExtractResumeDto extends createZodDto(extractResumeSchema) {}
