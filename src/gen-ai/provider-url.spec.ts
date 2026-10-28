import { afterEach, describe, expect, it, vi } from "vitest";

import { assertSafeProviderBaseUrl, safeProviderFetch } from "./provider-url";

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
    "https://100.64.0.1/v1",
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
    "https://[fe80::1]/v1",
    // URL parsing rewrites the dotted form to ::ffff:a00:1.
    "https://[::ffff:10.0.0.1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://user:pass@1.1.1.1/v1",
  ])("rejects %s", async (url) => {
    await expect(assertSafeProviderBaseUrl(url)).rejects.toThrow();
  });
});

describe("safeProviderFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a private target without issuing the request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeProviderFetch("https://127.0.0.1/v1")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables redirect following", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    await safeProviderFetch("https://1.1.1.1/v1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://1.1.1.1/v1",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
