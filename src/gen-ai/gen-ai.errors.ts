import { HttpException, HttpStatus } from "@nestjs/common";
import { APICallError, RetryError } from "ai";

export function findQuotaError(error: unknown): APICallError | null {
  if (RetryError.isInstance(error)) {
    for (const child of error.errors) {
      const found = findQuotaError(child);
      if (found) {
        return found;
      }
    }
    return null;
  }

  return APICallError.isInstance(error) && error.statusCode === 429
    ? error
    : null;
}

function rawQuotaError(error: unknown): APICallError | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  // The error arrives as `unknown` and is probed for a raw status before any narrowing:
  // provider SDKs don't guarantee an APICallError shape for quota failures, so read status/statusCode directly first.
  // The APICallError cast is only reached when the raw status is 429, which is the one case toQuotaExceededHttpException should treat as a quota error.
  const status =
    (error as { status?: number }).status ??
    (error as { statusCode?: number }).statusCode;

  return status === 429 ? (error as APICallError) : null;
}

function findProviderError(error: unknown): APICallError | null {
  if (RetryError.isInstance(error)) {
    for (const child of error.errors) {
      const found = findProviderError(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  return APICallError.isInstance(error) ? error : null;
}

export function toAiHttpException(
  error: unknown,
  provider?: string | null,
  model?: string | null,
): HttpException | null {
  const apiError = findProviderError(error);
  if (!apiError) {
    return null;
  }

  const status = apiError.statusCode;
  const providerLabel = provider ? ` (${provider})` : "";
  const modelLabel = model ? ` (${model})` : "";

  if (status === 429) {
    return toQuotaExceededHttpException(error, provider, model);
  }

  if (status === 401 || status === 403) {
    return new HttpException(
      `The API key for ${provider ?? "the AI provider"}${modelLabel} was rejected. Update it in Settings and try again.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  if (status === 404) {
    return new HttpException(
      `The selected AI model${modelLabel} is not available${provider ? ` for ${provider}` : ""}. Choose another model.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  if (status === 413) {
    return new HttpException(
      `The AI request is too large${provider ? ` for ${provider}` : ""}. Shorten the input and try again.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  if (status === 408) {
    return new HttpException(
      `The AI provider${providerLabel} timed out. Please try again.`,
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  if (status !== undefined && status >= 400 && status < 500) {
    return new HttpException(
      `The AI provider${providerLabel} rejected the request. Try a different model or shorten the input.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  return new HttpException(
    `The AI provider${providerLabel} is temporarily unavailable. Please try again later.`,
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

function providerErrorMessage(error?: APICallError): string | null {
  const data = error?.data as { error?: { message?: string } } | undefined;
  const message = data?.error?.message;
  if (!message) {
    return null;
  }
  return message.split("\n")[0]?.trim() ?? null;
}

// Google reports request-validation failures in `error.details[].fieldViolations[]`,
// not in `error.message`, which stays a generic "Request contains an invalid argument."
// Without this the log never says which part of the request the model refused.
export function providerErrorDetails(error?: APICallError): string[] {
  const data = error?.data as
    | {
        error?: {
          details?: {
            fieldViolations?: { field?: string; description?: string }[];
          }[];
        };
      }
    | undefined;

  const violations = data?.error?.details?.flatMap(
    (detail) => detail.fieldViolations ?? [],
  );

  return (violations ?? [])
    .map((violation) =>
      [violation.field, violation.description].filter(Boolean).join(": "),
    )
    .filter((entry) => entry.length > 0);
}

export function toQuotaExceededHttpException(
  error: unknown,
  provider?: string | null,
  model?: string | null,
): HttpException | null {
  const quotaError = findQuotaError(error) ?? rawQuotaError(error);
  if (!quotaError) {
    return null;
  }

  const providerLabel = provider ? ` for ${provider}` : "";
  const modelLabel = model ? ` (${model})` : "";
  const message = `AI quota or rate limit exceeded${providerLabel}${modelLabel}. Please wait for the limit to reset, or check your plan and billing details, then try again.`;

  return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

const MAX_ERROR_DEPTH = 5;
const TIMEOUT_ERROR_NAMES = new Set(["AbortError", "TimeoutError"]);

function isTimeoutError(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > MAX_ERROR_DEPTH) {
    return false;
  }

  const name = (error as { name?: unknown }).name;
  if (typeof name === "string" && TIMEOUT_ERROR_NAMES.has(name)) {
    return true;
  }

  if (RetryError.isInstance(error)) {
    return error.errors.some((child) => isTimeoutError(child, depth + 1));
  }

  const cause = (error as { cause?: unknown }).cause;
  return cause !== undefined && isTimeoutError(cause, depth + 1);
}

export function toAiTimeoutException(error: unknown): HttpException | null {
  if (!isTimeoutError(error)) {
    return null;
  }

  return new HttpException(
    "The AI request timed out. Please try again.",
    HttpStatus.GATEWAY_TIMEOUT,
  );
}

export function describeProviderError(error: unknown): {
  reason: string;
  violations: string[];
} {
  const apiError = findProviderError(error) ?? undefined;

  return {
    reason:
      providerErrorMessage(apiError) ??
      (error instanceof Error ? error.message : String(error)),
    violations: providerErrorDetails(apiError),
  };
}
