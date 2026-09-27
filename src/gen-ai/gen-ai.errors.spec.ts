import { HttpException, HttpStatus } from "@nestjs/common";
import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";

import {
  findQuotaError,
  providerErrorDetails,
  toQuotaExceededHttpException,
  toAiHttpException,
} from "./gen-ai.errors";

const quotaApiError = new APICallError({
  message:
    "You exceeded your current quota, please check your plan and billing details.",
  url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  requestBodyValues: {},
  statusCode: 429,
  isRetryable: true,
  data: {
    error: {
      message:
        "You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generate_content_free_tier_requests, limit: 20\nPlease retry in 32s.",
    },
  },
});

const serverApiError = new APICallError({
  message: "Internal server error",
  url: "https://provider.example/completion",
  requestBodyValues: {},
  statusCode: 500,
  isRetryable: true,
});

const quotaRetryError = new RetryError({
  message: "Failed after 3 attempts",
  reason: "maxRetriesExceeded",
  errors: [serverApiError, quotaApiError],
});

describe("findQuotaError", () => {
  it("unwraps a 429 APICallError from a RetryError", () => {
    expect(findQuotaError(quotaRetryError)).toBe(quotaApiError);
  });

  it("returns null when no quota error is present", () => {
    const retry = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [serverApiError],
    });
    expect(findQuotaError(retry)).toBeNull();
  });

  it("returns null for an APICallError with a non-429 status", () => {
    expect(findQuotaError(serverApiError)).toBeNull();
  });

  it("returns null for unrelated errors", () => {
    expect(findQuotaError(new Error("boom"))).toBeNull();
  });
});

describe("toQuotaExceededHttpException", () => {
  it("maps a RetryError wrapping a 429 to a 429 HttpException with a friendly message", () => {
    const exception = toQuotaExceededHttpException(
      quotaRetryError,
      "google",
      "gemini-2.5-flash",
    );

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(exception?.message).toContain("google");
    expect(exception?.message).toContain("gemini-2.5-flash");
    expect(exception?.message).toContain("quota");
  });

  it("matches a raw 429 error object (e.g. @google/genai client)", () => {
    const exception = toQuotaExceededHttpException(
      { status: 429, message: "RESOURCE_EXHAUSTED" },
      "google",
    );

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it("returns null for non-quota errors", () => {
    expect(toQuotaExceededHttpException(serverApiError, "google")).toBeNull();
    expect(
      toQuotaExceededHttpException(new Error("boom"), "google"),
    ).toBeNull();
  });
});

const busyApiError = new APICallError({
  message:
    "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
  url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  requestBodyValues: {},
  statusCode: 503,
  isRetryable: true,
  data: {
    error: {
      message:
        "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    },
  },
});

const busyRetryError = new RetryError({
  message: "Failed after 3 attempts",
  reason: "maxRetriesExceeded",
  errors: [busyApiError, serverApiError],
});

describe("toAiHttpException", () => {
  it("maps a RetryError wrapping a 503 to a 503 HttpException with a friendly message", () => {
    const exception = toAiHttpException(
      busyRetryError,
      "google",
      "gemini-3.8-flash",
    );

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception?.message).toContain("google");
    expect(exception?.message).toContain("gemini-3.8-flash");
    expect(exception?.message).toContain(
      "This model is currently experiencing high demand",
    );
  });

  it("returns null for unrelated errors", () => {
    expect(toAiHttpException(new Error("boom"), "google")).toBeNull();
  });
});

// Google answers a malformed request with a generic `error.message` and puts the
// actionable part in `error.details[].fieldViolations`, so the violations are the
// only thing that tells the caller which field was wrong.
const fieldViolationError = new APICallError({
  message: "Request contains an invalid argument.",
  url: "https://generativelanguage.googleapis.com/v1beta/models/x",
  requestBodyValues: {},
  statusCode: 400,
  isRetryable: false,
  data: {
    error: {
      message: "Request contains an invalid argument.",
      details: [
        {
          fieldViolations: [
            {
              field: "generationConfig.maxOutputTokens",
              description: "too big",
            },
            { field: "contents", description: "must not be empty" },
          ],
        },
      ],
    },
  },
});

describe("providerErrorDetails", () => {
  it("flattens field violations into readable entries", () => {
    expect(providerErrorDetails(fieldViolationError)).toEqual([
      "generationConfig.maxOutputTokens: too big",
      "contents: must not be empty",
    ]);
  });

  it("returns an empty list when the provider reports no violations", () => {
    expect(providerErrorDetails(busyApiError)).toEqual([]);
    expect(providerErrorDetails(serverApiError)).toEqual([]);
    expect(providerErrorDetails()).toEqual([]);
  });

  it("tolerates details entries that carry no violations", () => {
    const error = new APICallError({
      message: "bad",
      url: "https://provider.example",
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
      data: { error: { details: [{}, { fieldViolations: [] }] } },
    });

    expect(providerErrorDetails(error)).toEqual([]);
  });

  it("renders a violation that has only a field or only a description", () => {
    const error = new APICallError({
      message: "bad",
      url: "https://provider.example",
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
      data: {
        error: {
          details: [
            {
              fieldViolations: [
                { field: "contents" },
                { description: "must not be empty" },
                {},
              ],
            },
          ],
        },
      },
    });

    expect(providerErrorDetails(error)).toEqual([
      "contents",
      "must not be empty",
    ]);
  });
});

describe("toAiHttpException with field violations", () => {
  it("appends the violations to the message so the bad field is named", () => {
    const exception = toAiHttpException(
      fieldViolationError,
      "google",
      "gemini",
    );

    expect(exception?.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception?.message).toContain(
      "Request contains an invalid argument.",
    );
    expect(exception?.message).toContain("contents: must not be empty");
  });
});
