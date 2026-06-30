import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

export const JOB_STATUS = ["applied", "saved", "scheduled"] as const;

const baseJobSchema = z.object({
  title: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: z.enum(["applied", "saved", "scheduled"]).default("saved"),
  roleId: z.number().int().positive().nullable().optional(),
  topicIds: z.array(z.number().int().positive()).optional(),
  topicNames: z.array(z.string().trim().min(1)).optional(),
  links: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  location: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  interviewDate: z.coerce.date().nullable().optional(),
});

export class CreateJobDto extends createZodDto(baseJobSchema) {}
export class UpdateJobDto extends createZodDto(
  baseJobSchema.partial().refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}

const extractJobSchema = z.object({
  description: z.string().trim().min(1),
  links: z.string().optional(),
  provider: z.enum(GEN_AI_PROVIDERS),
});

export class ExtractJobDto extends createZodDto(extractJobSchema) {}

export const extractedJobSchema = baseJobSchema
  .omit({ roleId: true, topicIds: true })
  .partial()
  .extend({
    title: z.string(),
    topicNames: z.array(z.string()).optional(),
    roleName: z.string().trim().min(1).optional(),
  });

export class ExtractedJob extends createZodDto(extractedJobSchema) {}

export type TJobExtractionResult = Omit<
  ExtractedJob,
  "roleName" | "topicNames"
> & {
  roleId: number | null;
  topicIds: number[];
};
