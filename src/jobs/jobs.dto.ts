import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateJobSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: z.enum(["applied", "saved", "scheduled"]).default("saved"),
  roleId: z.number().int().positive().optional(),
  topicId: z.number().int().positive().optional(),
  deadline: z.coerce.date().optional(),
});

export class CreateJobDto extends createZodDto(CreateJobSchema) {}
export class UpdateJobDto extends createZodDto(CreateJobSchema.partial()) {}
