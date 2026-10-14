import { describe, expect, it } from "vitest";

import { extractedJobSchema } from "./jobs.dto";

describe("extractedJobSchema", () => {
  it("does not expose description, so extraction cannot overwrite the paste", () => {
    const parsed = extractedJobSchema.parse({
      companyName: "Acme",
      description: "an AI paraphrase of the posting",
      roleName: "Engineer",
      topicNames: ["React"],
    });

    expect(parsed).not.toHaveProperty("description");
  });

  it("still returns the fields extraction is meant to fill", () => {
    const parsed = extractedJobSchema.parse({
      companyName: "Acme",
      roleName: "Engineer",
      topicNames: ["React"],
    });

    expect(parsed).toMatchObject({
      companyName: "Acme",
      roleName: "Engineer",
      topicNames: ["React"],
    });
  });

  it("accepts the salary/work-type columns extraction may fill", () => {
    const parsed = extractedJobSchema.parse({
      companyName: "Acme",
      currency: "USD",
      experienceRequired: 5,
      roleName: "Engineer",
      salaryLower: 120_000,
      salaryUpper: 150_000,
      workType: "hybrid",
    });

    expect(parsed).toMatchObject({
      currency: "USD",
      experienceRequired: 5,
      salaryLower: 120_000,
      salaryUpper: 150_000,
      workType: "hybrid",
    });
  });

  it("accepts a zero-years requirement (entry level)", () => {
    const parsed = extractedJobSchema.parse({
      companyName: "Acme",
      experienceRequired: 0,
      roleName: "Engineer",
    });

    expect(parsed.experienceRequired).toBe(0);
  });

  it("rejects a salary upper bound below the lower bound", () => {
    const result = extractedJobSchema.safeParse({
      companyName: "Acme",
      roleName: "Engineer",
      salaryLower: 200_000,
      salaryUpper: 100_000,
    });

    expect(result.success).toBe(false);
  });
});
