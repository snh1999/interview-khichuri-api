import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import type { TApiKeyInsert } from "@/src/database/database.types";

const apiKeySchema = z.object({
  name: z.string().trim().min(1),
  platform: z.enum(["google", "openai"]),
  key: z.string(),
  isActive: z.boolean().default(false),
}) satisfies z.ZodType<TApiKeyInsert>;

export class CreateApiKeyDto extends createZodDto(apiKeySchema) {}

const findApiKeySchema = z.object({
  platform: z.enum(["google", "openai"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});
export class FindApiKeyQuery extends createZodDto(findApiKeySchema) {}
