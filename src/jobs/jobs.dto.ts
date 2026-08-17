import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  SHORT_LENGTH,
  TINY_LENGTH,
  nullishStr,
  requiredStr,
  str,
  dateStr,
} from "@/src/common/validation";
import type { TJob } from "@/src/database/database.types";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

export const JOB_STATUS = ["applied", "saved", "scheduled"] as const;

const baseJobSchema = z.object({
  title: requiredStr(SHORT_LENGTH),
  companyName: requiredStr(SHORT_LENGTH),
  description: requiredStr(),
  status: z.enum(JOB_STATUS).default("saved"),
  roleId: z.number().int().positive().nullish(),
  topicIds: z.array(z.number().int().positive()).optional(),
  links: nullishStr(),
  notes: nullishStr(),
  deadline: z.coerce.date().nullish(),
  location: nullishStr(SHORT_LENGTH),
  source: nullishStr(),
  interviewDate: z.coerce.date().nullish(),
  appliedAt: z.coerce.date().nullish(),
});

export class CreateJobDto extends createZodDto(baseJobSchema) {}
export class UpdateJobDto extends createZodDto(
  baseJobSchema
    .omit({ roleId: true })
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "At least one field required",
    }),
) {}

const extractJobSchema = z.object({
  description: requiredStr(),
  links: nullishStr(),
  provider: z.enum(GEN_AI_PROVIDERS),
  model: nullishStr(SHORT_LENGTH),
});

export class ExtractJobDto extends createZodDto(extractJobSchema) {}

export const extractedJobSchema = baseJobSchema
  .omit({
    roleId: true,
    topicIds: true,
    deadline: true,
    interviewDate: true,
    appliedAt: true,
  })
  .partial()
  .extend({
    title: str(SHORT_LENGTH),
    topicNames: z.array(str(TINY_LENGTH)).optional(),
    roleName: nullishStr(SHORT_LENGTH),
    deadline: dateStr,
    interviewDate: dateStr,
    appliedAt: dateStr,
  });

export class ExtractedJob extends createZodDto(extractedJobSchema) {}

export type TJobExtractionResult = Omit<
  ExtractedJob,
  "roleName" | "topicNames"
> & {
  roleId: number | null;
  topicIds: number[];
};

export type TJobWithTopicIds = TJob & {
  topicIds: number[];
};
