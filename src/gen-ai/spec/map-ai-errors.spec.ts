import { HttpException, HttpStatus, type Logger } from "@nestjs/common";
import { APICallError, NoObjectGeneratedError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiOutputException } from "@/src/gen-ai/ai-output-error";
import { mapAiError } from "@/src/gen-ai/map-ai-errors";

const apiError = (statusCode: number) =>
  new APICallError({
    message: "provider failure",
    url: "https://provider.example",
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode >= 500,
  });

describe("mapAiError", () => {
  const warn = vi.fn();
  const error = vi.fn();
  const logger = { warn, error } as unknown as Logger;

  const context = {
    provider: "google" as const,
    operation: "job extraction",
    logger,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["quota", apiError(429), HttpStatus.TOO_MANY_REQUESTS],
    [
      "timeout",
      Object.assign(new Error("slow"), { name: "TimeoutError" }),
      HttpStatus.GATEWAY_TIMEOUT,
    ],
    ["provider 4xx", apiError(400), HttpStatus.BAD_REQUEST],
    ["provider 5xx", apiError(503), HttpStatus.SERVICE_UNAVAILABLE],
  ])("maps %s failures", (_name, err, status) => {
    const mapped = mapAiError(err, context);

    expect(mapped).toBeInstanceOf(HttpException);
    expect((mapped as HttpException).getStatus()).toBe(status);
  });

  it("maps unparseable output to a retryable AiOutputException", () => {
    const mapped = mapAiError(
      new NoObjectGeneratedError({
        text: "not json",
        response: {} as never,
        usage: {} as never,
        finishReason: "error",
      }),
      context,
    );

    expect(mapped).toBeInstanceOf(AiOutputException);
    expect((mapped as AiOutputException).retryable).toBe(true);
    expect((mapped as AiOutputException).message).toContain("job extraction");
  });

  it("rethrows unknown failures unchanged", () => {
    const err = new Error("network down");

    expect(mapAiError(err, context)).toBe(err);
    expect(error).toHaveBeenCalledWith("AI request failed", {
      operation: "job extraction",
      errorName: "Error",
    });
  });
});
