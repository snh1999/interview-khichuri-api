/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-empty-function -- the provider SDK is replaced with async stubs; requiring a real `await` inside them would add noise, not coverage. */
import { createGoogle } from "@ai-sdk/google";
import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  APICallError,
  NoObjectGeneratedError,
  generateText,
  streamText,
} from "ai";
import type * as Ai from "ai";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";

import { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import {
  GOOGLE_TTS_DEFAULT_VOICE,
  GOOGLE_TTS_MODEL,
} from "@/src/gen-ai/gen-ai.constants";

import { GenAiService } from "./gen-ai.service";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>();
  return { ...actual, generateText: vi.fn(), streamText: vi.fn() };
});

vi.mock("@ai-sdk/google", () => ({ createGoogle: vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn() }));

// GoogleGenAI is constructed with `new`, so the stub has to be a real class.
const { googleGenerateContent } = vi.hoisted(() => ({
  googleGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: googleGenerateContent };
    constructor(readonly options: { apiKey: string }) {}
  },
}));

const MAX_RESUME_CHARS = 15000;

// `Output.object` validates against the schema, so it has to be a real one.
const stubSchema = z.object({ ok: z.boolean() });

const mockApiKey = {
  useApiKey: vi.fn(),
  assertActiveKey: vi.fn(),
};

let keyModel: string | null = null;

const makeService = async () => {
  const module = await Test.createTestingModule({
    providers: [GenAiService, { provide: ApiKeyService, useValue: mockApiKey }],
  }).compile();
  return module.get(GenAiService);
};

// The SDK is always reached through one provider factory call per request, so
// capturing the model name only needs the second argument of that factory.
const capturedModel = (): unknown => {
  const factory = vi.mocked(createGoogle).mock.results[0]?.value as
    Mock | undefined;
  return factory?.mock.calls[0]?.[0];
};

// `Output.object` hides the schema behind a resolved `responseFormat`, so the
// only way to see what actually goes on the wire is to await it.
const resolvedWireSchema = async (fn: typeof streamText): Promise<string> => {
  const output = fn.mock.calls[0]?.[0]?.output as unknown as {
    responseFormat: Promise<{ type: string; schema: unknown }>;
  };
  return JSON.stringify((await output.responseFormat).schema);
};

describe("GenAiService", () => {
  let service: GenAiService;

  beforeEach(async () => {
    vi.clearAllMocks();
    keyModel = null;
    mockApiKey.useApiKey.mockImplementation(
      async (
        _provider: string,
        operation: (info: { key: string; model: string | null }) => unknown,
      ) => await operation({ key: "sk-test", model: keyModel }),
    );
    vi.mocked(createGoogle).mockReturnValue(vi.fn() as never);
    vi.mocked(generateText).mockResolvedValue({
      output: { ok: true },
    } as never);
    service = await makeService();
  });

  describe("generateStructured", () => {
    it("passes the userId through to the key lookup so per-user keys resolve", async () => {
      await service.generateStructured({
        prompt: "p",
        schema: stubSchema,
        provider: "google",
        userId: "user-1",
      });

      expect(mockApiKey.useApiKey).toHaveBeenCalledWith(
        "google",
        expect.any(Function),
        "user-1",
      );
    });

    // Explicit model > the model stored on the key > the provider default. When
    // these collapse into one, a user who saved a model silently gets another.
    it("prefers the requested model over the one saved on the key", async () => {
      keyModel = "saved-model";

      await service.generateStructured({
        prompt: "p",
        schema: stubSchema,
        provider: "google",
        model: "requested-model",
      });

      expect(capturedModel()).toBe("requested-model");
    });

    it("falls back to the model saved on the key when none is requested", async () => {
      keyModel = "saved-model";

      await service.generateStructured({
        prompt: "p",
        schema: stubSchema,
        provider: "google",
      });

      expect(capturedModel()).toBe("saved-model");
    });

    it("falls back to the provider default when neither is set", async () => {
      await service.generateStructured({
        prompt: "p",
        schema: stubSchema,
        provider: "google",
      });

      expect(capturedModel()).toBe("gemini-3.5-flash-lite");
    });

    it("applies the default output-token cap and honours an explicit one", async () => {
      const schema = stubSchema;

      await service.generateStructured({
        prompt: "p",
        schema,
        provider: "google",
      });
      expect(vi.mocked(generateText).mock.calls[0]?.[0]).toMatchObject({
        maxOutputTokens: 8192,
      });

      await service.generateStructured({
        prompt: "p",
        schema: stubSchema,
        provider: "google",
        maxOutputTokens: 4000,
      });
      expect(vi.mocked(generateText).mock.calls[1]?.[0]).toMatchObject({
        maxOutputTokens: 4000,
      });
    });

    it("returns the structured output from the provider", async () => {
      const result = await service.generateStructured({
        prompt: "p",
        schema: stubSchema,
        provider: "google",
      });

      expect(result).toEqual({ ok: true });
    });

    // The whole point is what leaves the process, so assert on that rather than
    // on the Zod schema the caller handed in.
    it("strips the keywords Gemini rejects from the schema it sends", async () => {
      const constrained = z.object({
        name: z.string().min(1).max(5).default("x"),
      });

      await service.generateStructured({
        prompt: "p",
        schema: constrained,
        provider: "google",
      });

      const sent = await resolvedWireSchema(generateText);
      expect(sent).not.toMatch(/"\$schema"|"default"|"minLength"|"maxLength"/);
      expect(sent).toMatch(/"name"/);
    });

    it("maps a provider API failure to an HttpException carrying the provider and model", async () => {
      vi.mocked(generateText).mockRejectedValue(
        new APICallError({
          message: "boom",
          url: "https://provider.example",
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: true,
          data: { error: { message: "Model is overloaded" } },
        }),
      );

      const error = await service
        .generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "google",
          model: "gemini-3.5-flash-lite",
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect((error as HttpException).message).toContain("Model is overloaded");
    });

    it("maps an unparseable response to a BadRequestException", async () => {
      vi.mocked(generateText).mockRejectedValue(
        new NoObjectGeneratedError({
          text: "not json",
          response: {} as never,
          usage: {} as never,
          finishReason: "error",
        }),
      );

      await expect(
        service.generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "google",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // Gemini accepts only a subset of JSON Schema and answers anything outside
    // it with a bare 400 "Request contains an invalid argument.", no
    // fieldViolations naming the offending keyword. That is the exact failure
    // the resume schema produced, so the schema has to be droppable.
    describe("when Gemini rejects the response schema", () => {
      const schemaRejection = () =>
        new APICallError({
          message: "Request contains an invalid argument.",
          url: "https://generativelanguage.googleapis.com/v1beta",
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
          data: {
            error: { code: 400, status: "INVALID_ARGUMENT" },
          },
        });

      it("retries without responseJsonSchema and returns the result", async () => {
        vi.mocked(generateText)
          .mockRejectedValueOnce(schemaRejection())
          .mockResolvedValueOnce({ output: { ok: true } } as never);

        const result = await service.generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "google",
        });

        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ ok: true });
      });

      it("turns structured output off rather than sending a schema it refuses", async () => {
        vi.mocked(generateText)
          .mockRejectedValueOnce(schemaRejection())
          .mockResolvedValueOnce({ output: { ok: true } } as never);

        await service.generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "google",
        });

        expect(
          vi.mocked(generateText).mock.calls[0]?.[0].providerOptions,
        ).toBeUndefined();
        expect(
          vi.mocked(generateText).mock.calls[1]?.[0].providerOptions,
        ).toMatchObject({ google: { structuredOutputs: false } });
      });

      // Without a schema on the wire the model only has the prompt to go on, so
      // the retry has to describe the shape itself.
      it("describes the expected shape in the retry prompt", async () => {
        vi.mocked(generateText)
          .mockRejectedValueOnce(schemaRejection())
          .mockResolvedValueOnce({ output: { ok: true } } as never);

        await service.generateStructured({
          prompt: "PROMPT BODY",
          schema: stubSchema,
          provider: "google",
        });

        const retryPrompt = vi.mocked(generateText).mock.calls[1]?.[0]
          .prompt as string;
        expect(retryPrompt).toContain("PROMPT BODY");
        expect(retryPrompt).toContain('"ok"');
      });

      it("only pays the 400 once per model and schema", async () => {
        vi.mocked(generateText)
          .mockRejectedValueOnce(schemaRejection())
          .mockResolvedValue({ output: { ok: true } } as never);

        await service.generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "google",
        });
        await service.generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "google",
        });

        expect(
          vi.mocked(generateText).mock.calls[1]?.[0].providerOptions,
        ).toMatchObject({ google: { structuredOutputs: false } });
        expect(
          vi.mocked(generateText).mock.calls[2]?.[0].providerOptions,
        ).toMatchObject({ google: { structuredOutputs: false } });
      });

      it("still reports the failure when the retry fails too", async () => {
        vi.mocked(generateText).mockRejectedValue(schemaRejection());

        const error = await service
          .generateStructured({
            prompt: "p",
            schema: stubSchema,
            provider: "google",
          })
          .catch((e: unknown) => e);

        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
      });

      // A 400 that also fails without the schema was not the schema's fault --
      // it was the prompt, or a parameter Gemini dislikes. Recording it would
      // turn off structured output for that schema for the whole process.
      it("does not blacklist the schema when the retry fails too", async () => {
        vi.mocked(generateText).mockRejectedValue(schemaRejection());

        await expect(
          service.generateStructured({
            prompt: "p",
            schema: stubSchema,
            provider: "google",
          }),
        ).rejects.toThrow(HttpException);

        vi.mocked(generateText).mockResolvedValue({
          output: { ok: true },
        } as never);

        await service.generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "google",
        });

        expect(
          vi.mocked(generateText).mock.calls[2]?.[0].providerOptions,
        ).toBeUndefined();
      });

      it("does not let one rejected prompt disable the schema for another", async () => {
        vi.mocked(generateText)
          .mockRejectedValueOnce(schemaRejection())
          .mockResolvedValueOnce({ output: { ok: true } } as never);

        await service.generateStructured({
          prompt: "prompt one",
          schema: stubSchema,
          provider: "google",
        });
        await service.generateStructured({
          prompt: "prompt two",
          schema: stubSchema,
          provider: "google",
        });

        expect(
          vi.mocked(generateText).mock.calls[1]?.[0].providerOptions,
        ).toMatchObject({ google: { structuredOutputs: false } });
        // A different prompt has not been proven to fail, so it still gets the
        // schema and has to succeed on the first attempt.
        expect(
          vi.mocked(generateText).mock.calls[2]?.[0].providerOptions,
        ).toBeUndefined();
      });

      // Quota and overload failures are not the schema's fault, so replaying
      // them without the schema just doubles the cost of a doomed request.
      it("does not retry a failure that is not a rejected request", async () => {
        vi.mocked(generateText).mockRejectedValue(
          new APICallError({
            message: "boom",
            url: "https://generativelanguage.googleapis.com/v1beta",
            requestBodyValues: {},
            statusCode: 503,
            isRetryable: true,
            data: { error: { message: "Model is overloaded" } },
          }),
        );

        await expect(
          service.generateStructured({
            prompt: "p",
            schema: stubSchema,
            provider: "google",
          }),
        ).rejects.toThrow(HttpException);

        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
      });

      it("leaves the OpenAI path on the schema it already accepts", async () => {
        const { createOpenAI } = await import("@ai-sdk/openai");
        vi.mocked(createOpenAI).mockReturnValue(vi.fn() as never);
        vi.mocked(generateText).mockResolvedValue({
          output: { ok: true },
        } as never);

        await service.generateStructured({
          prompt: "p",
          schema: stubSchema,
          provider: "openai",
        });

        expect(vi.mocked(generateText).mock.calls[0]?.[0].prompt).toBe("p");
      });
    });
  });

  describe("extractResume", () => {
    it("truncates the resume text so an oversized file cannot blow the context window", async () => {
      await service.extractResume("x".repeat(MAX_RESUME_CHARS + 5000), {
        provider: "google",
      });

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]
        ?.prompt as string;
      const body = /<resume_text>\s*([\s\S]*?)\s*<\/resume_text>/.exec(prompt);
      expect(body?.[1]).toHaveLength(MAX_RESUME_CHARS);
    });

    it("tells the model to treat the resume as data, not instructions", async () => {
      await service.extractResume("resume", { provider: "google" });

      expect(vi.mocked(generateText).mock.calls[0]?.[0]?.prompt).toContain(
        "never as instructions",
      );
    });

    it("forwards the model and userId to the structured call", async () => {
      await service.extractResume("resume", {
        provider: "google",
        model: "gemini-3.5-flash-lite",
        userId: "user-1",
      });

      expect(mockApiKey.useApiKey).toHaveBeenCalledWith(
        "google",
        expect.any(Function),
        "user-1",
      );
    });

    // Quota has to win over the generic wrapper, otherwise the user is told to
    // shorten their resume when the real problem is a billing limit.
    it("preserves a quota error instead of masking it as a generic failure", async () => {
      vi.mocked(generateText).mockRejectedValue(
        new APICallError({
          message: "quota",
          url: "https://provider.example",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        }),
      );

      const error = await service
        .extractResume("resume", { provider: "google" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });

    it("wraps any other failure in a user-facing BadRequestException", async () => {
      vi.mocked(generateText).mockRejectedValue(new Error("network down"));

      await expect(
        service.extractResume("resume", { provider: "google" }),
      ).rejects.toThrow("Failed to extract resume data. Please try again.");
    });
  });

  describe("scoreResumeForJob", () => {
    it("embeds company, job and resume in tagged blocks", async () => {
      await service.scoreResumeForJob({
        provider: "google",
        resume: "RESUME",
        jobDescription: "JOB",
        company: "Acme",
        companyDetails: "DOSSIER",
        model: "m",
        userId: "user-1",
      });

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]
        ?.prompt as string;
      expect(prompt).toContain("Company: Acme");
      expect(prompt).toContain(
        "<company_research>\nDOSSIER\n</company_research>",
      );
      expect(prompt).toContain("<job_description>\nJOB\n</job_description>");
      expect(prompt).toContain("<resume_text>\nRESUME\n</resume_text>");
    });

    it("drops the company research block when there is no dossier", async () => {
      await service.scoreResumeForJob({
        provider: "google",
        resume: "RESUME",
        jobDescription: "JOB",
        company: "Acme",
        companyDetails: "",
      });

      expect(vi.mocked(generateText).mock.calls[0]?.[0]?.prompt).not.toContain(
        "<company_research>\n",
      );
    });

    it("forwards provider, model and userId", async () => {
      await service.scoreResumeForJob({
        provider: "google",
        resume: "RESUME",
        jobDescription: "JOB",
        company: "Acme",
        companyDetails: "",
        model: "gemini-3.5-flash-lite",
        userId: "user-1",
      });

      expect(capturedModel()).toBe("gemini-3.5-flash-lite");
      expect(mockApiKey.useApiKey).toHaveBeenCalledWith(
        "google",
        expect.any(Function),
        "user-1",
      );
    });
  });

  describe("reviewResumeStandalone", () => {
    it("wraps the resume in a tag and forwards the options", async () => {
      await service.reviewResumeStandalone({
        provider: "google",
        resume: "RESUME",
        model: "m",
        userId: "user-1",
      });

      expect(vi.mocked(generateText).mock.calls[0]?.[0]?.prompt).toContain(
        "<resume_text>\nRESUME\n</resume_text>",
      );
      expect(mockApiKey.useApiKey).toHaveBeenCalledWith(
        "google",
        expect.any(Function),
        "user-1",
      );
    });
  });

  describe("generateQuestions", () => {
    const session = {
      description: "Backend role",
      job: { description: "JOB DESC" },
      experience: "senior",
      questions: [{ questionText: "What is a closure?" }],
    } as never;
    const topics = [{ name: "node" }, { name: "react" }] as never;

    it("builds the context from session, role, topics and the requested count", async () => {
      await service.generateQuestions({
        provider: "google",
        topics,
        roleName: "Engineer",
        session,
        dto: { provider: "google", count: 3, avoidRepeat: false } as never,
      });

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]
        ?.prompt as string;
      expect(prompt).toContain("Description: Backend role");
      expect(prompt).toContain("Job description: JOB DESC");
      expect(prompt).toContain("Experience Level: senior");
      expect(prompt).toContain("Target Role: Engineer");
      expect(prompt).toContain("Topics: node, react");
      expect(prompt).toContain("Number of questions needed: 3");
    });

    it("includes previously asked questions only when avoidRepeat is set", async () => {
      await service.generateQuestions({
        provider: "google",
        topics,
        roleName: "Engineer",
        session,
        dto: { provider: "google", count: 2, avoidRepeat: false } as never,
      });
      expect(vi.mocked(generateText).mock.calls[0]?.[0]?.prompt).not.toContain(
        "Previously asked questions",
      );

      await service.generateQuestions({
        provider: "google",
        topics,
        roleName: "Engineer",
        session,
        dto: { provider: "google", count: 2, avoidRepeat: true } as never,
      });
      expect(vi.mocked(generateText).mock.calls[1]?.[0]?.prompt).toContain(
        "- What is a closure?",
      );
    });
  });

  describe("streamMarkdown", () => {
    it("forwards the abort signal and returns the provider text stream", async () => {
      const textStream = (async function* () {
        yield "hi";
      })();
      vi.mocked(streamText).mockReturnValue({ textStream } as never);
      const controller = new AbortController();

      const result = await service.streamMarkdown({
        provider: "google",
        prompt: "p",
        abortSignal: controller.signal,
      });

      expect(vi.mocked(streamText).mock.calls[0]?.[0]?.abortSignal).toBe(
        controller.signal,
      );
      expect(result).toBe(textStream);
    });
  });

  describe("streamQuestions", () => {
    it("forwards the abort signal and resolved model", async () => {
      const partialOutputStream = (async function* () {})();
      vi.mocked(streamText).mockReturnValue({ partialOutputStream } as never);
      const controller = new AbortController();
      keyModel = "saved-model";

      const result = await service.streamQuestions({
        provider: "google",
        conversation: "Q: hi",
        abortSignal: controller.signal,
      });

      expect(capturedModel()).toBe("saved-model");
      expect(vi.mocked(streamText).mock.calls[0]?.[0]?.abortSignal).toBe(
        controller.signal,
      );
      expect(result).toBe(partialOutputStream);
    });

    // A stream cannot be retried once it has started, so the schema Gemini gets
    // has to be acceptable on the first attempt.
    it("sends Gemini a schema without the keywords it rejects", async () => {
      const partialOutputStream = (async function* () {})();
      vi.mocked(streamText).mockReturnValue({ partialOutputStream } as never);

      await service.streamQuestions({
        provider: "google",
        conversation: "Q: hi",
      });

      const sent = await resolvedWireSchema(streamText);
      expect(sent).not.toMatch(/"\$schema"|"default"|"minLength"|"maxLength"/);
      // The shape itself has to survive, or the stream is useless.
      expect(sent).toMatch(/"questions"/);
    });

    it("leaves the OpenAI stream on the schema it already accepts", async () => {
      const { createOpenAI } = await import("@ai-sdk/openai");
      vi.mocked(createOpenAI).mockReturnValue(vi.fn() as never);
      const partialOutputStream = (async function* () {})();
      vi.mocked(streamText).mockReturnValue({ partialOutputStream } as never);

      await service.streamQuestions({
        provider: "openai",
        conversation: "Q: hi",
      });

      expect(await resolvedWireSchema(streamText)).toMatch(/"minLength"/);
    });
  });

  describe("synthesizeSpeech", () => {
    const audioResponse = (b64: string) => ({
      candidates: [{ content: { parts: [{ inlineData: { data: b64 } }] } }],
    });

    const mockGoogle = (impl: () => unknown) => {
      googleGenerateContent.mockReset();
      googleGenerateContent.mockImplementation(impl);
      return googleGenerateContent;
    };

    it("returns base64 wav audio for the requested text", async () => {
      mockGoogle(async () =>
        audioResponse(Buffer.from([1, 2]).toString("base64")),
      );

      const result = await service.synthesizeSpeech("hello", "Puck", "user-1");

      expect(result.format).toBe("wav");
      expect(result.audio).toMatch(/^data:audio\/wav;base64,/);
    });

    it("uses the default voice when none is supplied", async () => {
      const generateContent = mockGoogle(async () => audioResponse("AA=="));

      await service.synthesizeSpeech("hello", undefined, "user-1");

      const config = generateContent.mock.calls[0]?.[0] as {
        config: {
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
          };
        };
      };
      expect(
        config.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
      ).toBe(GOOGLE_TTS_DEFAULT_VOICE);
      expect(generateContent.mock.calls[0]?.[0]?.model).toBe(GOOGLE_TTS_MODEL);
    });

    // The cache is process-wide and not keyed by user, so the key check has to
    // happen on every call — including cache hits.
    it("re-checks that the caller owns an active key even on a cache hit", async () => {
      mockGoogle(async () => audioResponse("AA=="));
      await service.synthesizeSpeech("hello", "Puck", "user-1");
      googleGenerateContent.mockClear();

      await service.synthesizeSpeech("hello", "Puck", "user-2");

      expect(mockApiKey.assertActiveKey).toHaveBeenCalledTimes(2);
      expect(mockApiKey.assertActiveKey).toHaveBeenLastCalledWith(
        "google",
        "user-2",
      );
      expect(googleGenerateContent).not.toHaveBeenCalled();
    });

    it("serves a repeat request from cache without calling the provider", async () => {
      const generateContent = mockGoogle(async () => audioResponse("AA=="));

      const first = await service.synthesizeSpeech("hello", "Puck", "user-1");
      const second = await service.synthesizeSpeech("hello", "Puck", "user-1");

      expect(second).toBe(first);
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("keys the cache by voice as well as text", async () => {
      const generateContent = mockGoogle(async () => audioResponse("AA=="));

      await service.synthesizeSpeech("hello", "Puck", "user-1");
      await service.synthesizeSpeech("hello", "Zephyr", "user-1");

      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it("evicts the oldest entry once the cache is full", async () => {
      mockGoogle(async () => audioResponse("AA=="));
      for (let i = 0; i < 51; i++) {
        await service.synthesizeSpeech(`text-${i}`, "Puck", "user-1");
      }

      // The very first entry is gone, so asking for it hits the provider again.
      mockApiKey.assertActiveKey.mockClear();
      await service.synthesizeSpeech("text-0", "Puck", "user-1");
      expect(googleGenerateContent).toHaveBeenCalled();
    });

    it("throws when the provider returns no audio data", async () => {
      mockGoogle(async () => ({ candidates: [] }));

      await expect(
        service.synthesizeSpeech("hello", "Puck", "user-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("preserves a quota error rather than masking it", async () => {
      mockGoogle(async () => {
        throw new APICallError({
          message: "quota",
          url: "https://provider.example",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        });
      });

      const error = await service
        .synthesizeSpeech("hello", "Puck", "user-1")
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });
  });
});
