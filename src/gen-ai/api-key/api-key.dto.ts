import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  MID_LENGTH,
  SHORT_LENGTH,
  nullishStr,
  requiredStr,
  str,
} from "@/src/common/validation";
import type { TApiKeyInsert } from "@/src/database/database.types";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

const apiKeySchema = z.object({
  name: requiredStr(SHORT_LENGTH),
  provider: z.enum(GEN_AI_PROVIDERS),
  key: str(MID_LENGTH),
  isActive: z.boolean().default(false),
  model: nullishStr(SHORT_LENGTH),
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
