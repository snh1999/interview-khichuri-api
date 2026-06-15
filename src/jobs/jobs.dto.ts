import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const baseJobSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: z.enum(["applied", "saved", "scheduled"]).default("saved"),
  roleId: z.number().int().positive().optional(),
  topicIds: z.array(z.number().int().positive()).optional(),
  links: z.string().optional(),
  notes: z.string().optional(),
  deadline: z.coerce.date().optional(),
});

export class CreateJobDto extends createZodDto(baseJobSchema) {}
export class UpdateJobDto extends createZodDto(
  baseJobSchema.partial().refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}
