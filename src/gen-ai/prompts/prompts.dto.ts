import { z } from "zod";

import { MID_LENGTH, str } from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";

export const PROMPT_TYPES = [
  "resume",
  "behavioral",
  "technical",
  "system_design",
  "general",
  "custom",
] as const;

const createPromptSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(50, "Title must be 50 characters or fewer"),
  prompt: z
    .string()
    .trim()
    .min(20, "Prompt must be at least 20 characters")
    .max(3000, "Prompt must be 3000 characters or fewer"),
  type: z.enum(PROMPT_TYPES, { message: "Please select a valid type" }),
  isPublic: z.boolean().default(false),
});

export class CreatePromptDto extends createZodDto(createPromptSchema) {}

const updatePromptSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(50, "Title must be 50 characters or fewer")
    .optional(),
  prompt: z
    .string()
    .trim()
    .min(20, "Prompt must be at least 20 characters")
    .max(3000, "Prompt must be 3000 characters or fewer")
    .optional(),
  type: z
    .enum(PROMPT_TYPES, { message: "Please select a valid type" })
    .optional(),
  isPublic: z.boolean().optional(),
});

export class UpdatePromptDto extends createZodDto(updatePromptSchema) {}

const findPromptsQuerySchema = z.object({
  scope: z.enum(["public", "my"]).default("public"),
  type: z.enum(PROMPT_TYPES).optional(),
  search: str(MID_LENGTH).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export class FindPromptsQuery extends createZodDto(findPromptsQuerySchema) {}

const setDefaultPromptSchema = z.object({
  type: z.enum(PROMPT_TYPES),
  promptId: z.number().int().positive(),
});

export class SetDefaultPromptDto extends createZodDto(setDefaultPromptSchema) {}
