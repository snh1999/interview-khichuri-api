import { z } from "zod";

import {
  SHORT_LENGTH,
  URL_LENGTH,
  requiredStr,
  normalizedUrlStr,
  str,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { COMPANY_PROVIDERS } from "@/src/database/database.constants";

const ATS_BOARD_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const companySchema = z.object({
  name: requiredStr(SHORT_LENGTH),
  aliases: z.array(str(SHORT_LENGTH)).optional(),
  links: z
    .array(
      z.object({
        type: str(SHORT_LENGTH),
        url: normalizedUrlStr(URL_LENGTH),
      }),
    )
    .optional(),
  careerPageUrl: normalizedUrlStr(URL_LENGTH).nullish(),
  researchDossier: z.unknown().optional(),
  provider: z.enum(COMPANY_PROVIDERS).nullish(),
  enabled: z.boolean().optional(),
  atsBoardId: z
    .string()
    .trim()
    .regex(ATS_BOARD_ID_PATTERN, "Invalid ATS board id")
    .nullish(),
});

export class CreateCompanyDto extends createZodDto(companySchema) {}

export class UpdateCompanyDto extends createZodDto(
  companySchema.partial().extend({
    name: requiredStr(SHORT_LENGTH).optional(),
  }),
) {}
