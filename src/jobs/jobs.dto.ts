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
import { aiCommonSchema } from "@/src/gen-ai/gen-ai.constants";
import { PROFILE_WORK_TYPES } from "@/src/profile/profile.dto";

export const JOB_STATUS = [
  "applied",
  "saved",
  "scheduled",
  "interviewed",
  "offer",
  "rejected",
  "not_selected",
  "withdrawn",
] as const;

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
  workType: z.enum(PROFILE_WORK_TYPES).nullish(),
  salaryLower: z.number().int().positive().nullish(),
  salaryUpper: z.number().int().positive().nullish(),
  currency: z.string().length(3).nullish(),
  experienceRequired: z.number().int().nonnegative().nullish(),
  interviewDate: z.coerce.date().nullish(),
  appliedAt: z.coerce.date().nullish(),
});

export const deadlineBeforeInterview = (data: {
  deadline?: Date | null;
  interviewDate?: Date | null;
}): boolean =>
  !data.interviewDate || !data.deadline || data.deadline < data.interviewDate;

export const salaryRangeValid = (data: {
  salaryLower?: number | null;
  salaryUpper?: number | null;
}): boolean =>
  typeof data.salaryLower !== "number" ||
  typeof data.salaryUpper !== "number" ||
  data.salaryUpper >= data.salaryLower;

export class CreateJobDto extends createZodDto(
  baseJobSchema
    .refine(deadlineBeforeInterview, {
      message: "Deadline must be before the interview date",
    })
    .refine(salaryRangeValid, {
      message: "Salary upper bound must be at least the lower bound",
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
    })
    .refine(salaryRangeValid, {
      message: "Salary upper bound must be at least the lower bound",
    }),
) {}

const extractJobSchema = aiCommonSchema.extend({
  description: requiredStr(),
  links: nullishStr(),
});

export class ExtractJobDto extends createZodDto(extractJobSchema) {}

const generateFromTemplate = aiCommonSchema.extend({
  resumeId: z.uuid().nullish(),
});

export class GenerateFromTemplateDto extends createZodDto(
  generateFromTemplate,
) {}

export const extractedJobSchema = baseJobSchema
  .omit({
    roleId: true,
    topicIds: true,
    deadline: true,
    interviewDate: true,
    appliedAt: true,
    description: true,
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
  })
  .refine(salaryRangeValid, {
    message: "Salary upper bound must be at least the lower bound",
  });

export class ExtractedJob extends createZodDto(extractedJobSchema) {}

export type TJobExtractionResult = Omit<ExtractedJob, "roleName"> & {
  title?: string;
  roleId: number | null;
};

export type TJobWithTopicIds = TJob & {
  topicIds: number[];
};
