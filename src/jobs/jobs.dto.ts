import { z } from "zod";

import {
  SHORT_LENGTH,
  TINY_LENGTH,
  nullishStr,
  requiredStr,
  str,
  dateStr,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import type { TJob } from "@/src/database/database.types";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

export const JOB_STATUS = ["applied", "saved", "scheduled"] as const;

export const JOB_DATE_TYPES = ["deadline", "interview", "applied"] as const;

const dateFilterSchema = z.array(
  z.object({
    type: z.enum(JOB_DATE_TYPES),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
);

export type TDateFilter = z.infer<typeof dateFilterSchema>[number];

const parseJson = z.string().transform((val, ctx) => {
  try {
    return JSON.parse(val) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid filters format" });
    return z.NEVER;
  }
});

export const jobsQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(JOB_STATUS).optional(),
    filters: parseJson.pipe(dateFilterSchema).optional(),
  })
  .transform(({ filters, ...rest }) => ({
    ...rest,
    dateFilter: filters ?? [],
  }));

export type TJobsQuery = z.infer<typeof jobsQuerySchema>;

const baseJobSchema = z.object({
  title: requiredStr(SHORT_LENGTH),
  companyName: requiredStr(SHORT_LENGTH),
  companyId: z.number().int().positive().nullish(),
  description: requiredStr(),
  status: z.enum(JOB_STATUS).default("saved"),
  roleId: z.number().int().positive().nullish(),
  topicIds: z.array(z.number().int().positive()).optional(),
  links: nullishStr(),
  notes: nullishStr(),
  isFavorite: z.boolean().default(false),
  deadline: z.coerce.date().nullish(),
  location: nullishStr(SHORT_LENGTH),
  source: nullishStr(),
  interviewDate: z.coerce.date().nullish(),
  appliedAt: z.coerce.date().nullish(),
});

export const deadlineBeforeInterview = (data: {
  deadline?: Date | null;
  interviewDate?: Date | null;
}): boolean =>
  !data.interviewDate || !data.deadline || data.deadline < data.interviewDate;

export class CreateJobDto extends createZodDto(
  baseJobSchema.refine(deadlineBeforeInterview, {
    message: "Deadline must be before the interview date",
  }),
) {}
export class UpdateJobDto extends createZodDto(
  baseJobSchema
    .omit({ roleId: true })
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "At least one field required",
    })
    .refine(deadlineBeforeInterview, {
      message: "Deadline must be before the interview date",
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
    companyName: str(SHORT_LENGTH).nullish(),
    status: z.enum(JOB_STATUS).nullish(),
    location: str(SHORT_LENGTH).nullish(),
    source: str().nullish(),
    topicNames: z.array(str(TINY_LENGTH)).max(40).nullish(),
    roleName: str(SHORT_LENGTH).nullish(),
    deadline: dateStr,
    interviewDate: dateStr,
  });

export class ExtractedJob extends createZodDto(extractedJobSchema) {}

export type TJobExtractionResult = Omit<
  ExtractedJob,
  "roleName" | "topicNames"
> & {
  title?: string;
  roleId: number | null;
  topicIds: number[];
};

export type TJobWithTopicIds = TJob & {
  topicIds: number[];
};
