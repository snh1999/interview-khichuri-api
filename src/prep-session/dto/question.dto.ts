import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

const createQuestionSchema = z.object({
  questionText: z.string(),
  answer: z.string().nullish(),
  notes: z.string().nullish(),
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
  count: z.coerce.number().int().min(1).max(50).optional().default(5),
  avoidRepeat: z.boolean().optional().default(false),
  includeJobDescription: z.boolean().optional().default(true),
});

export class GenerateQuestionsDto extends createZodDto(
  generateQuestionsSchema,
) {}

export const generatedQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionText: z.string(),
        answer: z.string().nullish(),
        notes: z.string().nullish(),
      }),
    )
    .min(1)
    .max(20),
});

export type TGeneratedQuestions = z.infer<typeof generatedQuestionsSchema>;
