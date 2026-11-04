import { z } from "zod";

import { normalizeJobUrl, normalizeToHttpsUrl } from "@/src/common/url";

export const DEFAULT_MAX_STRING_LENGTH = 5000;
export const MAX_TEMPLATE_LENGTH = 10_000;
export const LARGE_LENGTH = 1023;
export const MID_LENGTH = 127;
export const SHORT_LENGTH = 80;
export const TINY_LENGTH = 31;
export const URL_LENGTH = 512;

const urlStr = (
  normalize: (value: string) => string | undefined,
  max: number,
): z.ZodType<string> =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((value, ctx) => {
      const normalized = normalize(value);
      if (!normalized || normalized.length > max) {
        ctx.addIssue({ code: "custom", message: "Invalid URL" });
        return z.NEVER;
      }
      return normalized;
    });

/** Absolute HTTPS URL stored as-is (normalized). */
export const normalizedUrlStr = (max = URL_LENGTH): z.ZodType<string> =>
  urlStr(normalizeToHttpsUrl, max);

/**
 * Absolute HTTPS URL, validated but not rewritten. Safe to embed in schemas that are also sent to the model
 * (a transform cannot be represented as JSON Schema).
 */
export const httpsUrlStr = (max = URL_LENGTH): z.ZodType<string> =>
  z
    .url()
    .max(max, `Must be at most ${max} characters`)
    .refine((value) => normalizeToHttpsUrl(value) !== undefined, {
      message: "Must be a valid HTTPS URL",
    })
    .describe(
      `Absolute HTTPS URL, e.g. https://example.com. At most ${max} characters.`,
    );

/** Absolute HTTP(S) job-posting URL, normalized for identity matching. */
export const jobUrlStr = (max = URL_LENGTH): z.ZodType<string> =>
  urlStr(normalizeJobUrl, max);

// Gemini ignores `maxLength`, so the limit is only visible to it in the
// description. A hint lets callers add semantic guidance without losing it.
const describeLength = (max: number, hint?: string): string =>
  hint ? `${hint} At most ${max} characters.` : `At most ${max} characters.`;

export const str = (
  max = DEFAULT_MAX_STRING_LENGTH,
  hint?: string,
): z.ZodString =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .describe(describeLength(max, hint));

/** Like `str`, but keeps whitespace: for code and exact-match snippets. */
export const untrimmedStr = (
  max = DEFAULT_MAX_STRING_LENGTH,
  hint?: string,
): z.ZodString =>
  z
    .string()
    .max(max, `Must be at most ${max} characters`)
    .describe(describeLength(max, hint));

export const currencyStr = z
  .string()
  .length(3)
  .describe("3-letter ISO 4217 currency code, e.g. USD.");

export const requiredStr = (max = DEFAULT_MAX_STRING_LENGTH): z.ZodString =>
  str(max).min(1);
export const nullishStr = (
  max = DEFAULT_MAX_STRING_LENGTH,
): z.ZodOptional<z.ZodNullable<z.ZodString>> => str(max).nullish();

export const dateStr = z.coerce
  .string()
  .describe("ISO 8601 date, e.g. 2024-01-31.")
  .nullish();

export const queryBool = (): z.ZodType<
  boolean | undefined,
  "true" | "false" | undefined
> =>
  z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional();

export const emailStr = z
  .email()
  .describe("Email address, e.g. name@example.com.")
  .nullish();

/**
 * Relaxed email for AI extraction: the model may return a malformed address that
 * the user fixes before saving. Write paths must use `emailStr`.
 */
export const extractedEmailStr = z
  .string()
  .describe("Email address, e.g. name@example.com.")
  .nullish();
