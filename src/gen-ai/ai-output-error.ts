import { BadRequestException, type Logger } from "@nestjs/common";
import {
  JSONParseError,
  NoObjectGeneratedError,
  TypeValidationError,
} from "ai";
import { ZodError } from "zod";

const MAX_LOGGED_ISSUES = 5;
const MAX_LOGGED_MESSAGE_LENGTH = 160;

const SAFE_ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  custom: "value failed validation",
  invalid_format: "value has an invalid format",
  invalid_type: "expected a different type",
  invalid_union: "value did not match any allowed shape",
  invalid_value: "value is not allowed",
  not_multiple_of: "value has an invalid step",
  too_big: "value is too long or too large",
  too_small: "value is too short or too small",
  unrecognized_keys: "unexpected field",
};

type TIssue = ZodError["issues"][number];

export class AiOutputException extends BadRequestException {
  public constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((result, part) => {
    if (typeof part === "number") {
      return `${result}[${part}]`;
    }
    const key = String(part);
    return result ? `${result}.${key}` : key;
  }, "");

const findZodError = (error: unknown, depth = 0): ZodError | null => {
  if (error instanceof ZodError) {
    return error;
  }
  if (depth >= 5 || typeof error !== "object" || error === null) {
    return null;
  }
  return findZodError((error as { cause?: unknown }).cause, depth + 1);
};

const sanitizeLogMessage = (message: string): string =>
  message.replaceAll(/\s+/g, " ").trim().slice(0, MAX_LOGGED_MESSAGE_LENGTH);

const describeIssue = (issue: TIssue): string => {
  const path = formatPath(issue.path);
  const detail = SAFE_ISSUE_MESSAGES[issue.code] ?? "value failed validation";
  return path ? `${path} (${detail})` : detail;
};

const logOutputError = (
  err: NoObjectGeneratedError,
  operation: string,
  logger: Logger,
  zodError: ZodError | null,
  malformedJson: boolean,
): void => {
  const issues = zodError?.issues ?? [];
  logger.warn(`AI ${operation} output could not be used`, {
    operation,
    finishReason: err.finishReason,
    textLength: err.text?.length ?? 0,
    issueCount: issues.length,
    issues: issues.slice(0, MAX_LOGGED_ISSUES).map((issue) => ({
      code: issue.code,
      path: formatPath(issue.path),
      message: sanitizeLogMessage(issue.message),
    })),
    malformedJson,
  });
};

/**
 * Maps an unparseable structured-output response to a safe, field-aware
 * BadRequestException. Non-output errors are left for the provider mapper.
 */
export const toAiOutputException = (
  err: unknown,
  operation: string,
  logger: Logger,
): AiOutputException | null => {
  if (!NoObjectGeneratedError.isInstance(err)) {
    return null;
  }

  const cause = err.cause;
  const malformedJson = JSONParseError.isInstance(cause);
  const zodError = findZodError(cause);
  logOutputError(err, operation, logger, zodError, malformedJson);

  if (err.finishReason === "length") {
    return new AiOutputException(
      `The AI response for ${operation} was cut off at the output limit. Shorten the input or choose a model with a larger output limit.`,
      false,
    );
  }

  if (err.finishReason === "content-filter") {
    return new AiOutputException(
      `The AI could not complete ${operation} because the response was blocked by a content filter. Adjust the input and try again.`,
      false,
    );
  }

  if (malformedJson) {
    return new AiOutputException(
      `The AI returned malformed JSON for ${operation}. Please try again.`,
      true,
    );
  }

  if (zodError && zodError.issues.length > 0) {
    const issues = zodError.issues;
    const more =
      issues.length > 1
        ? ` (${issues.length - 1} more issue${issues.length === 2 ? "" : "s"})`
        : "";
    return new AiOutputException(
      `The AI ${operation} result was invalid at ${describeIssue(
        issues[0],
      )}${more}. Please try again.`,
      true,
    );
  }

  if (TypeValidationError.isInstance(cause)) {
    return new AiOutputException(
      `The AI ${operation} result did not match the expected format. Please try again.`,
      true,
    );
  }

  if (!err.text?.trim()) {
    return new AiOutputException(
      `The AI returned no ${operation} result. Please try again.`,
      true,
    );
  }

  return new AiOutputException(
    `The AI could not produce a usable ${operation} result. Please try again.`,
    true,
  );
};
