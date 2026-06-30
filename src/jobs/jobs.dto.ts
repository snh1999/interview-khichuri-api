import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const JOB_STATUS = ["applied", "saved", "scheduled"] as const;

const baseJobSchema = z.object({
  title: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: z.enum(["applied", "saved", "scheduled"]).default("saved"),
  roleId: z.number().int().positive().optional(),
  topicIds: z.array(z.number().int().positive()).optional(),
  topicNames: z.array(z.string().trim().min(1)).optional(),
  links: z.string().optional(),
  notes: z.string().optional(),
  deadline: z.coerce.date().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  interviewDate: z.coerce.date().optional(),
});

export class CreateJobDto extends createZodDto(baseJobSchema) {}
export class UpdateJobDto extends createZodDto(
  baseJobSchema.partial().refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}
