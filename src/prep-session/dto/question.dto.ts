import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const createQuestionSchema = z.object({
  questionText: z.string(),
  answer: z.string().optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean().optional(),
});

export class CreateQuestionDto extends createZodDto(createQuestionSchema) {}

export class UpdateQuestionDto extends createZodDto(
  createQuestionSchema.partial().refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  }),
) {}

const FindQuestionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export class FindQuestionsDto extends createZodDto(FindQuestionsSchema) {}
