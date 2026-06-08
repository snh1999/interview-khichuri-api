import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreatePrepSessionSchema = z.object({
  description: z.string().trim().min(1),
  experience: z.string().optional(),
  jobId: z.uuid().optional(),
  roleId: z.number().int().positive().optional(),
  topicIds: z.array(z.number().int().positive()).optional(),
});

export class PrepSessionDto extends createZodDto(CreatePrepSessionSchema) {}
export class UpdatePrepSessionDto extends createZodDto(
  CreatePrepSessionSchema.partial(),
) {}
