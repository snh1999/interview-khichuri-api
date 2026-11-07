import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";

import { CrawlAiOwnerService } from "../crawl.ai-owner";

const admins = [
  {
    id: "older-admin",
    email: "Older@Example.test",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  },
  {
    id: "newer-admin",
    email: "newer@example.test",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

const configOf = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const setup = (rows = admins, keys: unknown[] = []) => {
  const orderBy = vi.fn(() => Promise.resolve(rows));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const pg = { select: vi.fn(() => ({ from })) };
  const apiKeys = { findAll: vi.fn(() => Promise.resolve(keys)) };

  const service = new CrawlAiOwnerService(
    pg as never,
    apiKeys as unknown as ApiKeyService,
    configOf({}),
  );

  return { service, apiKeys };
};

describe("CrawlAiOwnerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the oldest admin", async () => {
    const { service } = setup();

    await expect(service.resolveOwner()).resolves.toMatchObject({
      id: "older-admin",
      email: "Older@Example.test",
    });
  });

  it("pins CRAWL_AI_OWNER_EMAIL case-insensitively", async () => {
    const orderBy = vi.fn(() => Promise.resolve(admins));
    const service = new CrawlAiOwnerService(
      {
        select: () => ({ from: () => ({ where: () => ({ orderBy }) }) }),
      } as never,
      { findAll: vi.fn() } as unknown as ApiKeyService,
      configOf({ CRAWL_AI_OWNER_EMAIL: "  NEWER@example.TEST  " }),
    );

    await expect(service.resolveOwner()).resolves.toMatchObject({
      id: "newer-admin",
      email: "newer@example.test",
    });
  });

  it("ignores an unknown pinned email", async () => {
    const service = new CrawlAiOwnerService(
      {
        select: () => ({
          from: () => ({
            where: () => ({ orderBy: () => Promise.resolve(admins) }),
          }),
        }),
      } as never,
      { findAll: vi.fn() } as unknown as ApiKeyService,
      configOf({ CRAWL_AI_OWNER_EMAIL: "nobody@example.test" }),
    );

    await expect(service.resolveOwner()).resolves.toMatchObject({
      id: "older-admin",
    });
  });

  it("has no owner when there is no admin", async () => {
    const { service } = setup([]);

    await expect(service.resolveOwner()).resolves.toBeNull();
  });

  it("returns one active key per provider in GEN_AI_PROVIDERS order", async () => {
    const updatedAt = new Date("2026-10-27T00:00:00.000Z");
    const { service, apiKeys } = setup(admins, [
      { id: "openai-key", provider: "openai", updatedAt, model: "gpt-x" },
      { id: "google-key", provider: "google", updatedAt, model: null },
    ]);

    await expect(service.candidates("older-admin")).resolves.toEqual([
      {
        provider: "google",
        keyId: "google-key",
        updatedAt: updatedAt.getTime(),
        model: null,
      },
      {
        provider: "openai",
        keyId: "openai-key",
        updatedAt: updatedAt.getTime(),
        model: "gpt-x",
      },
    ]);
    expect(apiKeys.findAll).toHaveBeenCalledWith(
      undefined,
      true,
      "older-admin",
    );
  });

  it("drops unknown providers", async () => {
    const { service } = setup(admins, [
      {
        id: "other",
        provider: "anthropic",
        updatedAt: new Date(),
        model: null,
      },
    ]);

    await expect(service.candidates("older-admin")).resolves.toEqual([]);
  });
});
