import { z } from "zod";

import {
  MID_LENGTH,
  SHORT_LENGTH,
  nullishStr,
  requiredStr,
  str,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import type { TApiKeyInsert } from "@/src/database/database.types";
import {
  aiCommonSchema,
  GEN_AI_PROVIDERS,
} from "@/src/gen-ai/gen-ai.constants";

const apiKeySchema = aiCommonSchema.extend({
  name: requiredStr(SHORT_LENGTH),
  key: str(MID_LENGTH),
  isActive: z.boolean().default(false),
}) satisfies z.ZodType<TApiKeyInsert>;

export class CreateApiKeyDto extends createZodDto(apiKeySchema) {}

const updateApiKeySchema = z.object({
  name: requiredStr(SHORT_LENGTH).optional(),
  model: nullishStr(SHORT_LENGTH),
});

export class UpdateApiKeyDto extends createZodDto(updateApiKeySchema) {}

const findApiKeySchema = z.object({
  provider: z.enum(GEN_AI_PROVIDERS).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});
export class FindApiKeyQuery extends createZodDto(findApiKeySchema) {}
