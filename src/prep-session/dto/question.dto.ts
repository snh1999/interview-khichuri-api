import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  SHORT_LENGTH,
  nullishStr,
  requiredStr,
} from "@/src/common/validation";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

const createQuestionSchema = z.object({
  questionText: requiredStr(),
  answer: nullishStr(),
  notes: nullishStr(),
  isFavorite: z.boolean().nullish(),
});

export class CreateQuestionDto extends createZodDto(createQuestionSchema) {}

export class UpdateQuestionDto extends createZodDto(
  createQuestionSchema.partial().refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}

const generateQuestionsSchema = z.object({
  provider: z.enum(GEN_AI_PROVIDERS),
  model: nullishStr(SHORT_LENGTH),
  count: z.coerce.number().int().min(1).max(50).default(5),
  avoidRepeat: z.boolean().default(false),
  includeJobDescription: z.boolean().default(true),
});

export class GenerateQuestionsDto extends createZodDto(
  generateQuestionsSchema,
) {}

export const generatedQuestionsSchema = z.object({
  questions: z
    .array(createQuestionSchema.omit({ isFavorite: true }))
    .min(1)
    .max(20),
});

export type TGeneratedQuestions = z.infer<typeof generatedQuestionsSchema>;
