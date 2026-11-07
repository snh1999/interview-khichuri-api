import { describe, expect, it } from "vitest";

import { CreateJobDto, extractedJobSchema } from "./jobs.dto";

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

describe("CreateJobDto URLs", () => {
  const base = {
    title: "Engineer",
    companyName: "Acme",
    description: "Build things",
    status: "saved",
    isFavorite: false,
  };

  it("normalizes a job URL before it reaches the service", () => {
    const parsed = CreateJobDto.schema.parse({
      ...base,
      url: "https://Example.com/job/?utm_source=x#frag",
    });

    expect(parsed.url).toBe("https://example.com/job");
  });

  it("rejects non-http job URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "/jobs/1",
    ]) {
      expect(CreateJobDto.schema.safeParse({ ...base, url }).success).toBe(
        false,
      );
    }
  });

  it("canonicalizes a legacy bare link into the stored JSON shape", () => {
    const parsed = CreateJobDto.schema.parse({
      ...base,
      links: "https://example.com/job-posting",
    });

    expect(JSON.parse(String(parsed.links))).toEqual([
      { url: "https://example.com/job-posting", label: null },
    ]);
  });

  it("rejects a stored link whose URL is not http(s)", () => {
    const links = JSON.stringify([
      { url: "javascript:alert(1)", label: "apply" },
    ]);

    expect(CreateJobDto.schema.safeParse({ ...base, links }).success).toBe(
      false,
    );
  });

  it("rejects an over-long URL", () => {
    const result = CreateJobDto.schema.safeParse({
      ...base,
      url: `https://acme.test/${"a".repeat(600)}`,
    });

    expect(result.success).toBe(false);
  });

  it("does not let a link carry prototype-pollution keys", () => {
    const parsed = CreateJobDto.schema.parse({
      ...base,
      links:
        '[{"url":"https://acme.test/jobs/1","label":"apply","__proto__":{"polluted":true}}]',
    });

    expect(JSON.parse(String(parsed.links))).toEqual([
      { url: "https://acme.test/jobs/1", label: "apply" },
    ]);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
