import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Injectable } from "@nestjs/common";
import { generateText, Output } from "ai";
import type { z } from "zod";

import type { TApiKeyProvider } from "@/src/database/database.types";
import { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import {
  PROVIDER_CONFIG,
  RESUME_EXTRACTION_PROMPT,
} from "@/src/gen-ai/gen-ai.constants";
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
}
