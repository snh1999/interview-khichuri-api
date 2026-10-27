import { z } from "zod";

import { SHORT_LENGTH, nullishStr, requiredStr } from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";

const createPrepSessionSchema = z.object({
  title: requiredStr(SHORT_LENGTH),
  description: nullishStr(),
  experience: nullishStr(),
  trackedJobId: z.uuid().nullish(),
  roleId: z.number().int().positive().nullish(),
  topicIds: z.array(z.number().int().positive()).optional(),
  isFavorite: z.boolean().default(false),
});

export class CreatePrepSessionDto extends createZodDto(
  createPrepSessionSchema,
) {}
export class UpdatePrepSessionDto extends createZodDto(
  createPrepSessionSchema
    .omit({ trackedJobId: true, roleId: true })
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "At least one field required",
    }),
) {}
