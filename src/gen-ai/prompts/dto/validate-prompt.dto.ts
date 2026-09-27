import { z } from "zod";

import { MID_LENGTH, requiredStr, str } from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { aiCommonSchema } from "@/src/gen-ai/gen-ai.constants";

import { PROMPT_TYPES } from "../prompts.dto";

const validatePromptSchema = aiCommonSchema.extend({
  prompt: requiredStr(),
  type: z.enum(PROMPT_TYPES),
  title: str(MID_LENGTH).optional(),
});

export class ValidatePromptDto extends createZodDto(validatePromptSchema) {}
