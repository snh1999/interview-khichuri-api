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
