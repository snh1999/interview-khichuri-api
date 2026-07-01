import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Injectable } from "@nestjs/common";
import { generateText, Output } from "ai";
import type { z } from "zod";

import {
  TApiKeyProvider,
  TPrepSessionWithQuestions,
  TTopics,
} from "@/src/database/database.types";
import { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import {
  EXTRACTION_PROMPT,
  GENERATE_INTERVIEW_QUESTIONS_PROMPT_FALLBACK,
  PROVIDER_CONFIG,
  RESUME_EXTRACTION_PROMPT,
} from "@/src/gen-ai/gen-ai.constants";
import { ExtractedJob, extractedJobSchema } from "@/src/jobs/jobs.dto";
import {
  generatedQuestionsSchema,
  GenerateQuestionsDto,
  TGeneratedQuestions,
} from "@/src/prep-session/dto/question.dto";
import {
  extractedProfileSchema,
  TExtractedProfile,
} from "@/src/resume/resume.dto";

interface IGenerateStructuredOptions {
  model?: string;
}

@Injectable()
export class GenAiService {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    provider: TApiKeyProvider,
    options?: IGenerateStructuredOptions,
    userId?: string,
  ): Promise<T> {
    const config = PROVIDER_CONFIG[provider];

    return this.apiKeyService.useApiKey(
      provider,
      async ({ key, model }) => {
        const modelName = options?.model ?? model ?? config.defaultModel;
        const providerInstance =
          config.sdk === "google"
            ? createGoogleGenerativeAI({ apiKey: key })
            : createOpenAI({ apiKey: key, baseURL: config.baseURL });

        const result = await generateText({
          model: providerInstance(modelName),
          output: Output.object({ schema }),
          prompt,
        });

        return result.output;
      },
      userId,
    );
  }

  async extractJob(options: {
    description: string;
    provider: TApiKeyProvider;
    links?: string;
  }): Promise<ExtractedJob> {
    const { description, provider, links } = options;
    const prompt = `${EXTRACTION_PROMPT}${description}${links ? `\n\nLinks/URLs:\n${links}` : ""}`;
    return this.generateStructured(prompt, extractedJobSchema, provider);
  }

  async extractResume(
    resumeText: string,
    provider: TApiKeyProvider,
  ): Promise<TExtractedProfile> {
    return this.generateStructured(
      `${RESUME_EXTRACTION_PROMPT}${resumeText}`,
      extractedProfileSchema,
      provider,
    );
  }

  async generateQuestions(options: {
    provider: TApiKeyProvider;
    topics: TTopics[];
    roleName: string;
    session: TPrepSessionWithQuestions;
    dto: GenerateQuestionsDto;
  }): Promise<TGeneratedQuestions> {
    const { provider, topics, roleName, session, dto } = options;
    const { count, avoidRepeat } = dto;

    const topicNames = topics.map((topic) => topic.name);

    const contextParts = [
      `Description: ${session.description}`,
      session.job ? `Job description: ${session.job.description}` : "",
      session.experience ? `Experience Level: ${session.experience}` : "",
      roleName ? `Target Role: ${roleName}` : "",
      topicNames.length > 0 ? `Topics: ${topicNames.join(", ")}` : "",
      count ? `Number of questions needed: ${count}` : "",
    ].filter(Boolean);

    if (avoidRepeat && session.questions.length > 0) {
      const previousQuestions = session.questions
        .map((q) => `- ${q.questionText}`)
        .join("\n");
      contextParts.push(`Previously asked questions:\n${previousQuestions}`);
    }

    const context = contextParts.join("\n");

    const prompt = `${GENERATE_INTERVIEW_QUESTIONS_PROMPT_FALLBACK}\n\n${context}`;
    return this.generateStructured(prompt, generatedQuestionsSchema, provider);
  }
}
