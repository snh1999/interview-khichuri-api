import { describe, expect, it } from "vitest";

import { normalizeJobUrl, normalizeToHttpsUrl } from "./url";

describe("normalizeJobUrl", () => {
  it("keeps the Greenhouse embed id, which is the only identity on that URL", () => {
    expect(
      normalizeJobUrl("https://acme.test/careers?gh_jid=123&utm_source=x"),
    ).toBe("https://acme.test/careers?gh_jid=123");
  });

  it("strips tracking parameters and the fragment", () => {
    expect(
      normalizeJobUrl("https://acme.test/jobs/1?ref=feed&lever-source=x#apply"),
    ).toBe("https://acme.test/jobs/1");
  });

  it("keeps plain http job URLs, which crawlers still publish", () => {
    expect(normalizeJobUrl("http://acme.test/jobs/1")).toBe(
      "http://acme.test/jobs/1",
    );
  });
});

describe("normalizeStoredUrl", () => {
  it("keeps ordinary https links", () => {
    expect(normalizeToHttpsUrl("https://acme.test/team")).toBe(
      "https://acme.test/team",
    );
  });

  it("rejects http, script, data, file, relative and credential-bearing URLs", () => {
    for (const value of [
      "http://acme.test/team",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "/jobs/1",
      "https://user:pass@acme.test/jobs",
    ]) {
      expect(normalizeToHttpsUrl(value)).toBeUndefined();
    }
  });
});
