import { describe, expect, it } from "vitest";

import {
  referenceSchema,
  updateProfileSchema,
} from "@/src/profile/profile.dto";

import { emailStr, jobUrlStr } from "./validation";

describe("emailStr", () => {
  it("accepts a valid email and nullish values", () => {
    expect(emailStr.parse("name@example.com")).toBe("name@example.com");
    expect(emailStr.parse(null)).toBeNull();
    expect(emailStr.parse(undefined)).toBeUndefined();
  });

  it("rejects a malformed email", () => {
    expect(emailStr.safeParse("not-an-email").success).toBe(false);
  });

  it("is enforced by profile and reference write schemas", () => {
    expect(
      updateProfileSchema.shape.email.safeParse("not-an-email").success,
    ).toBe(false);
    expect(referenceSchema.shape.email.safeParse("not-an-email").success).toBe(
      false,
    );
  });
});

describe("jobUrlStr", () => {
  it("keeps HTTP job URLs so existing rows stay matchable", () => {
    expect(jobUrlStr().parse("http://example.com/job/?utm_source=x")).toBe(
      "http://example.com/job",
    );
  });

  it("still accepts HTTPS job URLs", () => {
    expect(jobUrlStr().parse("https://example.com/job")).toBe(
      "https://example.com/job",
    );
  });
});
