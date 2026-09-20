import { z } from "zod";

import { SHORT_LENGTH, requiredStr, str } from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";

const companySchema = z.object({
  name: requiredStr(SHORT_LENGTH),
  aliases: z.array(str(SHORT_LENGTH)).optional(),
  links: z
    .array(
      z.object({
        type: str(SHORT_LENGTH),
        url: z.url(),
      }),
    )
    .optional(),
  careerPageUrl: z.url().nullish(),
  researchDossier: z.unknown().optional(),
});

export class CreateCompanyDto extends createZodDto(companySchema) {}

export class UpdateCompanyDto extends createZodDto(
  companySchema.partial().extend({
    name: requiredStr(SHORT_LENGTH).optional(),
  }),
) {}
