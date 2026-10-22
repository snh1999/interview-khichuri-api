import { describe, expect, it } from "vitest";

import { assertSafeProviderBaseUrl } from "./provider-url";

describe("assertSafeProviderBaseUrl", () => {
  it("accepts a public HTTPS URL and strips trailing slashes", async () => {
    await expect(
      assertSafeProviderBaseUrl("https://1.1.1.1/v1/"),
    ).resolves.toBe("https://1.1.1.1/v1");
  });

  it.each([
    "http://1.1.1.1/v1",
    "https://localhost/v1",
    "https://api.localhost/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.1/v1",
    "https://192.168.1.1/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/v1",
    "https://user:pass@1.1.1.1/v1",
  ])("rejects %s", async (url) => {
    await expect(assertSafeProviderBaseUrl(url)).rejects.toThrow();
  });
});
