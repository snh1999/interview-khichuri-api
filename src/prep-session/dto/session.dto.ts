import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const createPrepSessionSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  experience: z.string().nullable().optional(),
  jobId: z.uuid().nullable().optional(),
  roleId: z.number().int().positive().nullable().optional(),
  topicIds: z.array(z.number().int().positive()).optional(),
  topicNames: z.array(z.string().trim().min(1)).optional(),
});

export class CreatePrepSessionDto extends createZodDto(
  createPrepSessionSchema,
) {}
export class UpdatePrepSessionDto extends createZodDto(
  createPrepSessionSchema
    .omit({ jobId: true, roleId: true })
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "At least one field required",
    }),
) {}
