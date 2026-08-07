import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { SHORT_LENGTH, nullishStr, requiredStr } from "@/src/common/validation";

const createPrepSessionSchema = z.object({
  title: requiredStr(SHORT_LENGTH),
  description: requiredStr(),
  experience: nullishStr(),
  jobId: z.uuid().nullish(),
  roleId: z.number().int().positive().nullish(),
  topicIds: z.array(z.number().int().positive()).optional(),
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
