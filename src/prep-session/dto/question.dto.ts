import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateQuestionSchema = z
  .object({
    answer: z.string().optional(),
    notes: z.string().optional(),
    isFavorite: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  });

export class QuestionDto extends createZodDto(CreateQuestionSchema) {}
export class UpdateQuestionDto extends createZodDto(
  CreateQuestionSchema.partial(),
) {}

const FindQuestionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export class FindQuestionsDto extends createZodDto(FindQuestionsSchema) {}
