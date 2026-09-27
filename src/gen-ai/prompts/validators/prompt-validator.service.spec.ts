import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenAiService } from "@/src/gen-ai/gen-ai.service";

import { PromptValidatorService } from "./prompt-validator.service";

const VALID_PROMPT = "This is a valid prompt for testing validation";

describe("PromptValidatorService", () => {
  let service: PromptValidatorService;
  const mockGenAiService = {
    generateStructured: vi.fn(),
  };

  const validate = (dto: Record<string, unknown>) =>
    service.validate(dto as never, "user-1");

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGenAiService.generateStructured.mockResolvedValue({
      pass: true,
      reason: "ok",
      suggestion: "",
    });
    const module = await Test.createTestingModule({
      providers: [
        PromptValidatorService,
        { provide: GenAiService, useValue: mockGenAiService },
      ],
    }).compile();
    service = module.get(PromptValidatorService);
  });

  describe("shapeCheck", () => {
    it("passes a well-formed prompt with a known type", async () => {
      const result = await validate({ prompt: VALID_PROMPT, type: "resume" });

      expect(result.shape).toEqual({ pass: true, errors: [] });
    });

    it("rejects an empty prompt", async () => {
      const result = await validate({ prompt: "   ", type: "resume" });

      expect(result.shape.pass).toBe(false);
      expect(result.shape.errors).toContainEqual({
        field: "prompt",
        message: "Prompt is required",
      });
    });

    it("rejects a prompt under the 20 character minimum", async () => {
      const result = await validate({ prompt: "short", type: "resume" });

      expect(result.shape.errors).toContainEqual({
        field: "prompt",
        message: "Prompt must be at least 20 characters",
      });
    });

    it("accepts a prompt at exactly the minimum length", async () => {
      const result = await validate({ prompt: "x".repeat(20), type: "resume" });

      expect(result.shape.errors).toEqual([]);
    });

    it("rejects a prompt over the 3000 character maximum", async () => {
      const result = await validate({
        prompt: "x".repeat(3001),
        type: "resume",
      });

      expect(result.shape.errors).toContainEqual({
        field: "prompt",
        message: "Prompt must be 3000 characters or fewer",
      });
    });

    it("rejects an unknown type", async () => {
      const result = await validate({ prompt: VALID_PROMPT, type: "nope" });

      expect(result.shape.errors).toContainEqual({
        field: "type",
        message: "Please select a valid type",
      });
    });

    it("rejects a blank title when one is supplied", async () => {
      const result = await validate({
        prompt: VALID_PROMPT,
        type: "resume",
        title: "  ",
      });

      expect(result.shape.errors).toContainEqual({
        field: "title",
        message: "Title is required",
      });
    });

    it("rejects a title over 50 characters", async () => {
      const result = await validate({
        prompt: VALID_PROMPT,
        type: "resume",
        title: "x".repeat(51),
      });

      expect(result.shape.errors).toContainEqual({
        field: "title",
        message: "Title must be 50 characters or fewer",
      });
    });

    it("reports every failing field at once", async () => {
      const result = await validate({ prompt: "short", type: "nope" });

      expect(result.shape.errors.map((e) => e.field).sort()).toEqual([
        "prompt",
        "type",
      ]);
    });
  });

  describe("validate", () => {
    it("sends the declared type and prompt to the judge", async () => {
      await validate({ prompt: VALID_PROMPT, type: "technical" });

      const prompt = mockGenAiService.generateStructured.mock.calls[0]?.[0]
        ?.prompt as string;
      expect(prompt).toContain('"technical"');
      expect(prompt).toContain(VALID_PROMPT);
    });

    it("forwards the provider, model and userId to the judge", async () => {
      await validate({
        prompt: VALID_PROMPT,
        type: "resume",
        provider: "openai",
        model: "gpt-4o-mini",
      });

      expect(mockGenAiService.generateStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          model: "gpt-4o-mini",
          userId: "user-1",
        }),
      );
    });

    it("returns the judge verdict alongside the shape result", async () => {
      const result = await validate({ prompt: VALID_PROMPT, type: "resume" });

      expect(result.llmJudge).toEqual({
        pass: true,
        reason: "ok",
        suggestion: "",
      });
    });

    // A dead key must not turn into a 500 — the user needs a shape result plus a
    // readable reason so they can go fix their key.
    it("blames the key when the provider rejects it", async () => {
      mockGenAiService.generateStructured.mockRejectedValue(
        new HttpException("unauthorized", HttpStatus.UNAUTHORIZED),
      );

      const result = await validate({
        prompt: VALID_PROMPT,
        type: "resume",
        provider: "openai",
      });

      expect(result.shape.pass).toBe(true);
      expect(result.llmJudge).toEqual({
        pass: false,
        reason:
          "AI validation failed — your openai API key was rejected. Check it in Settings.",
        suggestion: "",
      });
    });

    // ApiKeyService throws 404 when no active key is configured. Nothing was
    // rejected, so "rejected" would be wrong, and "try again" cannot help --
    // the user has to add a key.
    it("tells the user to add a key when none is configured", async () => {
      mockGenAiService.generateStructured.mockRejectedValue(
        new NotFoundException("No API key found for: google"),
      );

      const result = await validate({
        prompt: VALID_PROMPT,
        type: "resume",
        provider: "google",
      });

      expect(result.llmJudge?.reason).toBe(
        "AI validation needs an API key — none is configured for google. Add one in Settings.",
      );
    });

    it("blames the key on a 403 as well as a 401", async () => {
      mockGenAiService.generateStructured.mockRejectedValue(
        new HttpException("forbidden", HttpStatus.FORBIDDEN),
      );

      const result = await validate({
        prompt: VALID_PROMPT,
        type: "resume",
        provider: "google",
      });

      expect(result.llmJudge?.reason).toContain("was rejected");
    });

    // A rejected request, a rate limit or an overloaded model are not key
    // problems, and sending someone to Settings for one wastes their time.
    it("does not blame the key for failures that are not auth", async () => {
      for (const status of [
        HttpStatus.BAD_REQUEST,
        HttpStatus.TOO_MANY_REQUESTS,
        HttpStatus.SERVICE_UNAVAILABLE,
      ]) {
        mockGenAiService.generateStructured.mockRejectedValue(
          new HttpException("nope", status),
        );

        const result = await validate({
          prompt: VALID_PROMPT,
          type: "resume",
          provider: "google",
        });

        expect(result.llmJudge?.reason).toBe(
          "AI validation could not be completed. Please try again.",
        );
      }
    });

    it("does not blame the key for an error that is not an HttpException", async () => {
      mockGenAiService.generateStructured.mockRejectedValue(
        new Error("socket hang up"),
      );

      const result = await validate({
        prompt: VALID_PROMPT,
        type: "resume",
        provider: "openai",
      });

      expect(result.llmJudge?.reason).toBe(
        "AI validation could not be completed. Please try again.",
      );
    });

    // The shape check already settled it, so a model call is pure cost, and a
    // failure there would report a key problem next to unrelated errors.
    it("does not call the AI at all when the shape check fails", async () => {
      const result = await validate({ prompt: "short", type: "resume" });

      expect(result.shape.pass).toBe(false);
      expect(result.llmJudge).toBeNull();
      expect(mockGenAiService.generateStructured).not.toHaveBeenCalled();
    });
  });

  describe("assertValidOrThrow", () => {
    it("passes for a valid prompt", () => {
      expect(() => {
        service.assertValidOrThrow(VALID_PROMPT, "resume");
      }).not.toThrow();
    });

    it("throws with the collected errors for an invalid prompt", () => {
      expect.assertions(2);
      try {
        service.assertValidOrThrow("short", "resume");
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          message: "Prompt shape validation failed",
          errors: [{ field: "prompt" }],
        });
      }
    });

    it("throws when the title is too long", () => {
      expect(() => {
        service.assertValidOrThrow(VALID_PROMPT, "resume", "x".repeat(51));
      }).toThrow(BadRequestException);
    });
  });
});
