import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";

import { GenAiService } from "@/src/gen-ai/gen-ai.service";

import { ValidatePromptDto } from "../dto/validate-prompt.dto";
import { PROMPT_TYPES } from "../prompts.dto";

export interface IShapeError {
  field: string;
  message: string;
}

export interface IShapeCheckResult {
  pass: boolean;
  errors: IShapeError[];
}

export interface ILlmJudgeResult {
  pass: boolean;
  reason: string;
  suggestion: string;
}

export interface IValidationResult {
  shape: IShapeCheckResult;
  llmJudge: ILlmJudgeResult | null;
}

const judgeSchema = z.object({
  pass: z.boolean(),
  reason: z.string(),
  suggestion: z.string(),
});

type TJudgeResult = z.infer<typeof judgeSchema>;

@Injectable()
export class PromptValidatorService {
  constructor(private readonly genAiService: GenAiService) {}

  private shapeCheck(
    prompt: string,
    type: string,
    title?: string,
  ): IShapeCheckResult {
    const errors: IShapeError[] = [];

    if (!prompt || prompt.trim().length === 0) {
      errors.push({ field: "prompt", message: "Prompt is required" });
    } else if (prompt.trim().length < 20) {
      errors.push({
        field: "prompt",
        message: "Prompt must be at least 20 characters",
      });
    } else if (prompt.trim().length > 3000) {
      errors.push({
        field: "prompt",
        message: "Prompt must be 3000 characters or fewer",
      });
    }

    if (
      !type ||
      !PROMPT_TYPES.includes(type as (typeof PROMPT_TYPES)[number])
    ) {
      errors.push({ field: "type", message: "Please select a valid type" });
    }

    if (title !== undefined) {
      if (title.trim().length === 0) {
        errors.push({ field: "title", message: "Title is required" });
      } else if (title.trim().length > 50) {
        errors.push({
          field: "title",
          message: "Title must be 50 characters or fewer",
        });
      }
    }

    return { pass: errors.length === 0, errors };
  }

  async validate(
    { prompt, type, title, provider, model }: ValidatePromptDto,
    userId?: string,
  ): Promise<IValidationResult> {
    const shape = this.shapeCheck(prompt, type, title);

    const classifierPrompt = `You are a prompt quality classifier for an interview preparation platform.

    Analyze the following prompt and determine:
    
    1. Does it fit the declared category "${type}"? (e.g., a "technical" prompt should ask for coding/architecture questions)
    2. Does it violate any safety or content policies? (e.g., requesting harmful, unethical, or off-topic content)
    3. Is it likely to produce useful interview preparation content?
    
    Format reason and suggestion as short bullet lists (2-4 points max each). No paragraphs.
    
    Category: ${type}
    Prompt:
    """
    ${prompt}
    """`;

    const llmJudge = await this.genAiService
      .generateStructured<TJudgeResult>({
        prompt: classifierPrompt,
        schema: judgeSchema,
        userId,
        provider,
        model,
      })
      .catch(() => ({
        pass: false,
        reason: `AI validation failed — your ${provider} API key may be invalid. Check it in Settings.`,
        suggestion: "",
      }));

    return { shape, llmJudge };
  }

  assertValidOrThrow(prompt: string, type: string, title?: string): void {
    const shape = this.shapeCheck(prompt, type, title);
    if (!shape.pass) {
      throw new BadRequestException({
        message: "Prompt shape validation failed",
        errors: shape.errors,
      });
    }
  }
}
