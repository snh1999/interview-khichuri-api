import { z } from "zod";

export const DEFAULT_MAX_STRING_LENGTH = 5000;
export const LARGE_LENGTH = 1023;
export const MID_LENGTH = 127;
export const SHORT_LENGTH = 80;
export const TINY_LENGTH = 31;
export const URL_LENGTH = 512;

export const str = (max = DEFAULT_MAX_STRING_LENGTH): z.ZodString =>
  z.string().trim().max(max, `Must be at most ${max} characters`);
export const requiredStr = (max = DEFAULT_MAX_STRING_LENGTH): z.ZodString =>
  str(max).min(1);
export const nullishStr = (
  max = DEFAULT_MAX_STRING_LENGTH,
): z.ZodOptional<z.ZodNullable<z.ZodString>> => requiredStr(max).nullish();
