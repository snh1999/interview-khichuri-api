import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateQuestionSchema = z.object({
  answer: z.string().optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean().optional(),
});

export class QuestionDto extends createZodDto(CreateQuestionSchema) {}
export class UpdateQuestionDto extends createZodDto(
  CreateQuestionSchema.partial(),
) {}
