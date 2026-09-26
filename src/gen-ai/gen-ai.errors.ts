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
  provider: string,
  model?: string | null,
): HttpException | null {
  const apiError = findProviderError(error);
  if (!apiError) {
    return null;
  }

  const detail = providerErrorMessage(apiError);
  const modelLabel = model ? ` (${model})` : "";
  const status = apiError.statusCode ?? HttpStatus.SERVICE_UNAVAILABLE;

  const prefix = `AI request to "${provider}"${modelLabel} failed`;
  const message = detail
    ? `${prefix}: ${detail}`
    : `${prefix}. Please try again later.`;

  return new HttpException(message, status);
}

function providerErrorMessage(error?: APICallError): string | null {
  const data = error?.data as { error?: { message?: string } } | undefined;
  const message = data?.error?.message;
  if (!message) {
    return null;
  }
  return message.split("\n")[0]?.trim() ?? null;
}

export function toQuotaExceededHttpException(
  error: unknown,
  provider: string,
  model?: string | null,
): HttpException | null {
  const quotaError = findQuotaError(error) ?? rawQuotaError(error);
  if (!quotaError) {
    return null;
  }

  const detail = providerErrorMessage(quotaError);
  const modelLabel = model ? ` (${model})` : "";
  const message = `AI quota or rate limit exceeded for ${provider}${modelLabel}. ${
    detail ? `${detail} ` : ""
  }Please wait for the limit to reset, or check your plan and billing details, then try again.`;

  return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}
