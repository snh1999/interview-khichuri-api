import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const createPrepSessionSchema = z.object({
  description: z.string().trim().min(1),
  experience: z.string().nullable().optional(),
  jobId: z.uuid().nullable().optional(),
  roleId: z.number().int().positive().nullable().optional(),
  topicIds: z.array(z.number().int().positive()).optional(),
});

export class CreatePrepSessionDto extends createZodDto(
  createPrepSessionSchema,
) {}
export class UpdatePrepSessionDto extends createZodDto(
  createPrepSessionSchema.partial(),
) {}
