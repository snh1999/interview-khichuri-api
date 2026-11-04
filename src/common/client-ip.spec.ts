import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveClientIp } from "./client-ip";

const req = (headers: Record<string, string>, ip?: string) =>
  ({ headers, ip }) as unknown as Request;

afterEach(() => vi.unstubAllEnvs());

describe("resolveClientIp", () => {
  it("uses cf-connecting-ip on Render", () => {
    vi.stubEnv("RENDER", "true");
    expect(
      resolveClientIp(req({ "cf-connecting-ip": "203.0.113.9" }, "10.0.0.1")),
    ).toBe("203.0.113.9");
  });

  it("accepts IPv6", () => {
    vi.stubEnv("RENDER", "true");
    expect(
      resolveClientIp(req({ "cf-connecting-ip": "2001:db8::1" }, "10.0.0.1")),
    ).toBe("2001:db8::1");
  });

  it("falls back for multi-value or invalid headers", () => {
    vi.stubEnv("RENDER", "true");
    expect(
      resolveClientIp(
        req({ "cf-connecting-ip": "1.2.3.4, 5.6.7.8" }, "10.0.0.1"),
      ),
    ).toBe("10.0.0.1");
    expect(
      resolveClientIp(req({ "cf-connecting-ip": "nope" }, "10.0.0.1")),
    ).toBe("10.0.0.1");
  });

  it("ignores the header off Render", () => {
    vi.stubEnv("RENDER", "");
    expect(
      resolveClientIp(req({ "cf-connecting-ip": "203.0.113.9" }, "10.0.0.1")),
    ).toBe("10.0.0.1");
  });

  it("returns unknown when req.ip is absent", () => {
    vi.stubEnv("RENDER", "");
    expect(resolveClientIp(req({}))).toBe("unknown");
  });
});
