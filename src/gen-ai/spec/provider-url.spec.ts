import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("undici", () => ({
  fetch: mocks.fetch,
  Agent: function AgentMock() {
    return { close: vi.fn() };
  },
}));

import {
  assertSafeProviderBaseUrl,
  isPrivateIp,
  safeProviderFetch,
} from "../provider-url";

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::",
    "0:0:0:0:0:0:0:1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:c0a8:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "2002:7f00:1::",
    "fd00::1",
    "fe80::1",
  ])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "2606:4700:4700::1111", "::ffff:808:808"])(
    "allows %s",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );
});

describe("assertSafeProviderBaseUrl", () => {
  it("accepts a public HTTPS URL and strips trailing slashes", async () => {
    await expect(
      assertSafeProviderBaseUrl("https://1.1.1.1/v1/"),
    ).resolves.toBe("https://1.1.1.1/v1");
  });

  it.each([
    "http://1.1.1.1/v1",
    "https://localhost/v1",
    "https://localhost./v1",
    "https://api.localhost/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.1/v1",
    "https://192.168.1.1/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/v1",
    "https://[::1]/v1",
    "https://[0:0:0:0:0:0:0:1]/v1",
    "https://[fc00::1]/v1",
    "https://[fe80::1]/v1",
    "https://[64:ff9b::a00:1]/v1",
    "https://[2002:7f00:1::]/v1",
    // URL parsing rewrites the dotted form to ::ffff:a00:1.
    "https://[::ffff:10.0.0.1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://user:pass@1.1.1.1/v1",
  ])("rejects %s", async (url) => {
    await expect(assertSafeProviderBaseUrl(url)).rejects.toThrow();
  });
});

describe("assertSafeProviderBaseUrl in app mode", () => {
  const original = process.env.IS_APP_MODE;

  beforeEach(() => {
    process.env.IS_APP_MODE = "true";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.IS_APP_MODE;
    } else {
      process.env.IS_APP_MODE = original;
    }
  });

  it.each([
    ["http://localhost:11434/v1/", "http://localhost:11434/v1"],
    ["http://127.0.0.1:8080/v1", "http://127.0.0.1:8080/v1"],
    ["http://[::1]:1234/v1/", "http://[::1]:1234/v1"],
    ["https://localhost:11434/v1", "https://localhost:11434/v1"],
  ])("allows local base URL %s", async (input, expected) => {
    await expect(assertSafeProviderBaseUrl(input)).resolves.toBe(expected);
  });

  it.each([
    "http://1.1.1.1/v1",
    "http://api.localhost/v1",
    "http://192.168.1.1/v1",
  ])("still rejects %s", async (url) => {
    await expect(assertSafeProviderBaseUrl(url)).rejects.toThrow();
  });

  it("fetches local base URLs without the guarded dispatcher", async () => {
    mocks.fetch.mockClear();
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));

    await safeProviderFetch("http://localhost:11434/v1/chat/completions");

    const [, options] = mocks.fetch.mock.calls[0];
    expect(options).not.toHaveProperty("dispatcher");
  });
});

describe("safeProviderFetch", () => {
  it("rejects a private target without issuing the request", async () => {
    await expect(safeProviderFetch("https://127.0.0.1/v1")).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("disables redirect following and uses the guarded dispatcher", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 302 }));

    await safeProviderFetch("https://1.1.1.1/v1");

    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://1.1.1.1/v1",
      expect.objectContaining({
        redirect: "manual",
        dispatcher: expect.anything(),
      }),
    );
  });
});
