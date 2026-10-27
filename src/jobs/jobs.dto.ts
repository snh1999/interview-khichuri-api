import { z } from "zod";

import { normalizeJobUrl } from "@/src/common/url";
import {
  SHORT_LENGTH,
  TINY_LENGTH,
  URL_LENGTH,
  nullishStr,
  requiredStr,
  str,
  dateStr,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { JOB_STATUS } from "@/src/database/database.constants";
import type { TJob, TTrackedJob } from "@/src/database/database.types";
import { aiCommonSchema } from "@/src/gen-ai/gen-ai.constants";
import { PROFILE_WORK_TYPES } from "@/src/profile/profile.dto";

export const jobsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
});

export type TJobsQuery = z.infer<typeof jobsQuerySchema>;

const baseJobSchema = z.object({
  title: requiredStr(SHORT_LENGTH),
  companyName: requiredStr(SHORT_LENGTH),
  companyId: z.number().int().positive().nullish(),
  description: requiredStr(),
  roleId: z.number().int().positive().nullish(),
  topicIds: z.array(z.number().int().positive()).optional(),
  links: nullishStr(),
  deadline: z.coerce.date().nullish(),
  location: nullishStr(SHORT_LENGTH),
  url: nullishStr(),
  workType: z.enum(PROFILE_WORK_TYPES).nullish(),
  salaryLower: z.number().int().positive().nullish(),
  salaryUpper: z.number().int().positive().nullish(),
  currency: z.string().length(3).nullish(),
  experienceRequired: z.number().int().nonnegative().nullish(),
});

/** Per-user tracking state — owned by the tracked_jobs row. */
const trackedJobSchema = z.object({
  status: z.enum(JOB_STATUS).optional(),
  isFavorite: z.boolean().optional(),
  notes: nullishStr(),
  appliedAt: z.coerce.date().nullish(),
  interviewDate: z.coerce.date().nullish(),
});

export type TTrackedJobFields = z.infer<typeof trackedJobSchema>;

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
    .extend(trackedJobSchema.shape)
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
    .refine(salaryRangeValid, {
      message: "Salary upper bound must be at least the lower bound",
    }),
) {}

export class UpdateTrackedJobDto extends createZodDto(
  trackedJobSchema.refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}

const extractJobSchema = aiCommonSchema.extend({
  description: requiredStr(),
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
    description: true,
    links: true,
  })
  .partial()
  .extend({
    companyName: str(SHORT_LENGTH).nullish(),
    location: str(SHORT_LENGTH).nullish(),
    url: str().nullish(),
    topicNames: z.array(str(TINY_LENGTH)).max(40).nullish(),
    roleName: str(SHORT_LENGTH).nullish(),
    deadline: dateStr,
  })
  .refine(salaryRangeValid, {
    message: "Salary upper bound must be at least the lower bound",
  });

export class ExtractedJob extends createZodDto(extractedJobSchema) {}

export type TJobExtractionResult = Omit<ExtractedJob, "roleName"> & {
  title?: string;
  roleId: number | null;
};

export class FindJobByUrlDto extends createZodDto(
  z.object({
    url: requiredStr(URL_LENGTH).refine(
      (value) => normalizeJobUrl(value) !== undefined,
      { message: "Invalid job URL" },
    ),
  }),
) {}

export type TJobPopulated = TJob & {
  topicIds?: number[];
  track: TTrackedJob | null;
};
