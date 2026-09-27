import { z } from "zod";

import { nullishStr, queryBool, requiredStr } from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import type { TInterview } from "@/src/database/database.types";
import { aiCommonSchema } from "@/src/gen-ai/gen-ai.constants";

export const INTERVIEW_MODES = z.enum(["qa_flow", "interview_flow"]);

export type TInterviewMode = z.infer<typeof INTERVIEW_MODES>;

const transcriptItemSchema = z.object({
  questionId: z.number().int().positive(),
  question: requiredStr(),
  answer: nullishStr(),
  seconds: z.number().int().min(0),
});

const FOCUS_TYPES = z.enum([
  "prepsession",
  "resume",
  "job_description",
  "company",
  "topics",
  "question_bank",
]);

export type TInterviewFocusType = z.infer<typeof FOCUS_TYPES>;

const createInterviewSchema = aiCommonSchema.extend({
  sessionId: z.uuid(),
  mode: INTERVIEW_MODES.default("qa_flow"),
  focusTypes: z.array(FOCUS_TYPES).optional(),
  topicNames: z.array(requiredStr()).optional(),
  questionCount: z.number().int().min(1).max(50).optional(),
  maxDurationMinutes: z.number().int().min(1).max(180).optional(),
});

export class CreateInterviewDto extends createZodDto(createInterviewSchema) {}

const completeInterviewSchema = aiCommonSchema.extend({
  transcript: z.array(transcriptItemSchema).min(1).max(50),
  elapsedSeconds: z.number().int().min(0),
});

export class CompleteInterviewDto extends createZodDto(
  completeInterviewSchema,
) {}

const followUpSchema = aiCommonSchema.extend({
  answers: z.array(transcriptItemSchema).min(1).max(50),
});

export class FollowUpDto extends createZodDto(followUpSchema) {}

const listInterviewsQuerySchema = z.object({
  sessionId: z.uuid().optional(),
  completed: queryBool(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export class ListInterviewsQuery extends createZodDto(
  listInterviewsQuerySchema,
) {}

export const interviewEvaluationSchema = z.object({
  overall: z.number().int().min(0).max(100),
  technical: z.number().int().min(0).max(100),
  communication: z.number().int().min(0).max(100),
  problemSolving: z.number().int().min(0).max(100),
  leadershipFit: z.number().int().min(0).max(100),
  summaryMarkdown: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

export interface TInterviewQuestion {
  questionText: string;
  answer?: string | null;
  notes?: string | null;
}

export interface IInterviewWithQuestions {
  interview: TInterview;
  questions: TInterviewQuestion[];
}

export const generatedInterviewQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionText: z.string().default(""),
        answer: nullishStr(),
        notes: nullishStr(),
      }),
    )
    .min(1)
    .max(30),
});
