import { describe, expect, it } from "vitest";

import { aiCommonSchema, MAX_INSTRUCTION_LENGTH } from "./gen-ai.constants";

const base = { provider: "google" } as const;

describe("aiCommonSchema instruction", () => {
  it("accepts an instruction at the limit", () => {
    const result = aiCommonSchema.safeParse({
      ...base,
      instruction: "a".repeat(MAX_INSTRUCTION_LENGTH),
    });

    expect(result.success).toBe(true);
  });

  it("rejects an instruction one character over the limit", () => {
    const result = aiCommonSchema.safeParse({
      ...base,
      instruction: "a".repeat(MAX_INSTRUCTION_LENGTH + 1),
    });

    expect(result.success).toBe(false);
  });

  // The field is optional and nullish, because most AI actions never send one.
  it("stays optional and accepts an explicit null", () => {
    expect(aiCommonSchema.safeParse(base).success).toBe(true);
    expect(
      aiCommonSchema.safeParse({ ...base, instruction: null }).success,
    ).toBe(true);
  });

  // Length is measured after trimming, so padding cannot smuggle a longer
  // instruction past the limit.
  it("measures the limit after trimming", () => {
    const result = aiCommonSchema.safeParse({
      ...base,
      instruction: `   ${"a".repeat(MAX_INSTRUCTION_LENGTH)}   `,
    });

    expect(result.success).toBe(true);
  });
});
