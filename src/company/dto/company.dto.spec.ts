import { describe, expect, it } from "vitest";

import { CreateCompanyDto } from "./company.dto";

describe("CreateCompanyDto URLs", () => {
  const base = { name: "Acme" };

  it("normalizes stored company URLs", () => {
    const parsed = CreateCompanyDto.schema.parse({
      ...base,
      careerPageUrl: "https://Acme.test/careers",
      links: [{ type: "careers", url: "https://acme.test/jobs" }],
    });

    expect(parsed.careerPageUrl).toBe("https://acme.test/careers");
    expect(parsed.links?.[0].url).toBe("https://acme.test/jobs");
  });

  it("rejects non-http company URLs", () => {
    expect(
      CreateCompanyDto.schema.safeParse({
        ...base,
        careerPageUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      CreateCompanyDto.schema.safeParse({
        ...base,
        links: [{ type: "careers", url: "file:///etc/passwd" }],
      }).success,
    ).toBe(false);
  });

  it("keeps rejecting path traversal in the ATS board id", () => {
    expect(
      CreateCompanyDto.schema.safeParse({
        ...base,
        atsBoardId: "../../etc/passwd",
      }).success,
    ).toBe(false);
  });

  it("rejects an ATS board id that tries to add a host", () => {
    for (const atsBoardId of ["acme@evil.com", "acme.example.com", "a b"]) {
      expect(
        CreateCompanyDto.schema.safeParse({ ...base, atsBoardId }).success,
      ).toBe(false);
    }
  });
});
