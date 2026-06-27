import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import type { TApiKeyInsert } from "@/src/database/database.types";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

const apiKeySchema = z.object({
  name: z.string().trim().min(1),
  provider: z.enum(GEN_AI_PROVIDERS),
  key: z.string(),
  isActive: z.boolean().default(false),
  model: z.string().optional(),
}) satisfies z.ZodType<TApiKeyInsert>;

export class CreateApiKeyDto extends createZodDto(apiKeySchema) {}

const updateApiKeySchema = z.object({
  name: z.string().trim().min(1).optional(),
  model: z.string().optional().nullable(),
});

export class UpdateApiKeyDto extends createZodDto(updateApiKeySchema) {}

const findApiKeySchema = z.object({
  provider: z.enum(GEN_AI_PROVIDERS).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});
export class FindApiKeyQuery extends createZodDto(findApiKeySchema) {}
