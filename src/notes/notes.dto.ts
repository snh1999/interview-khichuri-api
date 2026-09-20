import { z } from "zod";

import {
  SHORT_LENGTH,
  queryBool,
  requiredStr,
  str,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

const createNoteSchema = z.object({
  title: requiredStr(SHORT_LENGTH),
  details: str().nullish(),
  questionId: z.number().int().positive().nullish(),
  jobId: z.uuid().nullish(),
  isFavorite: z.boolean().default(false),
});

export class CreateNoteDto extends createZodDto(createNoteSchema) {}

const updateNoteSchema = createNoteSchema
  .omit({ questionId: true, jobId: true })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  });

export class UpdateNoteDto extends createZodDto(updateNoteSchema) {}

const listNotesQuerySchema = z.object({
  isFavorite: queryBool(),
  search: str(SHORT_LENGTH).optional(),
});

export class ListNotesQuery extends createZodDto(listNotesQuerySchema) {}

const learnMoreSchema = z.object({
  questionText: requiredStr(),
  provider: z.enum(GEN_AI_PROVIDERS),
  model: z.string().trim().max(SHORT_LENGTH).nullish(),
});

export class LearnMoreDto extends createZodDto(learnMoreSchema) {}

export const markdownSchema = z.object({
  markdown: z.string(),
});

export type TLearnMoreResult = z.infer<typeof markdownSchema>;
