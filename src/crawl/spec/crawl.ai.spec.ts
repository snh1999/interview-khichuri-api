import { NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@ai-sdk/google", () => ({
  createGoogle: vi.fn(() => (model: string) => ({ model })),
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => (model: string) => ({ model })),
}));

import type { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import { PROVIDER_CONFIG } from "@/src/gen-ai/gen-ai.constants";

import { CrawlAiService, nextMidnightPacific } from "../crawl.ai";
import type {
  CrawlAiOwnerService,
  ICrawlAiCandidate,
  ICrawlAiOwner,
} from "../crawl.ai-owner";

const owner: ICrawlAiOwner = { id: "owner-1", email: "owner@test.dev" };

const candidate = (
  overrides: Partial<ICrawlAiCandidate> = {},
): ICrawlAiCandidate => ({
  provider: "google",
  keyId: "key-google",
  updatedAt: Date.parse("2026-10-27T00:00:00.000Z"),
  model: null,
  ...overrides,
});

const setup = (
  candidates: ICrawlAiCandidate[] = [candidate()],
  ownerValue: ICrawlAiOwner | null = owner,
) => {
  const ownerService = {
    resolveOwner: vi.fn(() => Promise.resolve(ownerValue)),
    candidates: vi.fn(() => Promise.resolve(candidates)),
  };
  const apiKeys = {
    useApiKey: vi.fn(
      (
        provider: string,
        operation: (creds: {
          key: string;
          model: string | null;
          baseUrl: string | null;
          id: string;
          updatedAt: Date;
        }) => unknown,
        _userId?: string,
      ) => {
        const match = candidates.find((entry) => entry.provider === provider);
        if (!match) throw new NotFoundException("No active API key");
        return operation({
          key: `${provider}-secret`,
          model: match.model,
          baseUrl: null,
          id: match.keyId,
          updatedAt: new Date(match.updatedAt),
        });
      },
    ),
  };

  const ai = new CrawlAiService(
    ownerService as unknown as CrawlAiOwnerService,
    apiKeys as unknown as ApiKeyService,
  );

  return { ai, ownerService, apiKeys };
};

const readyAi = async (candidates = [candidate()]) => {
  const context = setup(candidates);
  await context.ai.refresh();
  return context;
};

describe("CrawlAiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has no owner, so it makes no AI call", async () => {
    const { ai } = setup([], null);
    await ai.refresh();

    expect(ai.isEnabled()).toBe(false);
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    await expect(ai.status()).resolves.toMatchObject({
      enabled: false,
      reason: "no-admin",
      ownerEmail: null,
      provider: null,
      model: null,
      pausedUntil: null,
    });
  });

  it("has an owner but no active key", async () => {
    const { ai } = await readyAi([]);

    expect(ai.isEnabled()).toBe(false);
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });
    await expect(ai.status()).resolves.toMatchObject({
      enabled: false,
      reason: "no-key",
      ownerEmail: owner.email,
      provider: null,
      model: null,
    });
  });

  it("parses fenced JSON descriptions", async () => {
    mocks.generateText.mockResolvedValue({
      text: '```json\n{"description":"  Build APIs  "}\n```',
    });

    const { ai } = await readyAi();

    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: true,
      value: "Build APIs",
    });
  });

  it("drops AI listing URLs that are not in the anchor set", async () => {
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        jobs: [
          { url: "https://x.test/jobs/a?utm_source=feed", title: "A" },
          { url: "https://x.test/jobs/invented", title: "Invented" },
        ],
      }),
    });

    const { ai } = await readyAi();

    await expect(
      ai.extractListing("page", [
        { url: "https://x.test/jobs/a", title: "Backend" },
      ]),
    ).resolves.toEqual({
      ok: true,
      value: [
        {
          externalId: null,
          url: "https://x.test/jobs/a",
          title: "A",
          location: null,
          description: null,
        },
      ],
    });
  });

  it("gives the model the anchor titles next to the URLs", async () => {
    mocks.generateText.mockResolvedValue({ text: '{"jobs":[]}' });

    const { ai } = await readyAi();
    await ai.extractListing("page", [
      { url: "https://x.test/jobs/a", title: "Backend" },
    ]);

    const [{ prompt }] = mocks.generateText.mock.calls[0] as [
      { prompt: string },
    ];
    expect(prompt).toContain("https://x.test/jobs/a\tBackend");
  });

  it("skips the listing call when the page has no anchors", async () => {
    const { ai } = await readyAi();

    await expect(ai.extractListing("page", [])).resolves.toEqual({
      ok: false,
      retryable: false,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("treats unparseable JSON as a hard failure", async () => {
    mocks.generateText.mockResolvedValue({ text: "not json" });

    const { ai } = await readyAi();

    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: false,
    });
  });

  it("pauses for 2 minutes on a per-minute 429 instead of retrying in-process", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText.mockRejectedValue({
      status: 429,
      responseBody: '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
    });

    const { ai } = await readyAi();
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(ai.isAvailable(Date.parse("2026-10-27T12:01:59.000Z"))).toBe(false);
    expect(ai.isPaused(Date.parse("2026-10-27T12:01:59.000Z"))).toBe(true);
    expect(ai.isPaused(Date.parse("2026-10-27T12:02:00.000Z"))).toBe(false);
    expect(ai.isAvailable(Date.parse("2026-10-27T12:02:00.000Z"))).toBe(true);
  });

  it("grows the 429 pause 2, 4, 8, 10 minutes and resets after a success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));

    const { ai } = await readyAi();
    const rateLimited = {
      status: 429,
      responseBody: '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
    };
    let now = new Date("2026-10-27T12:00:00.000Z").getTime();

    for (const minutes of [2, 4, 8, 10]) {
      mocks.generateText.mockRejectedValueOnce(rateLimited);
      await expect(ai.extractDescription("page")).resolves.toEqual({
        ok: false,
        retryable: true,
      });

      now += minutes * 60_000;
      expect(ai.isPaused(now - 1)).toBe(true);
      expect(ai.isPaused(now)).toBe(false);
      vi.setSystemTime(new Date(now));
    }

    mocks.generateText.mockResolvedValueOnce({ text: '{"description":"ok"}' });
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: true,
      value: "ok",
    });

    mocks.generateText.mockRejectedValueOnce(rateLimited);
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });
    expect(ai.isPaused(now + 60_000)).toBe(true);
    expect(ai.isPaused(now + 2 * 60_000)).toBe(false);
  });

  it("pauses until the next PT midnight on the first daily-quota 429", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText.mockRejectedValue({
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          details: [
            {
              violations: [
                {
                  quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                },
              ],
            },
          ],
        },
      }),
    });

    const { ai } = await readyAi();
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(ai.isPaused(Date.parse("2026-10-28T06:59:00.000Z"))).toBe(true);
    expect(ai.isPaused(Date.parse("2026-10-28T07:00:00.000Z"))).toBe(false);
  });

  it("leaves a per-minute 429 to the next tick instead of pausing the day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText.mockRejectedValue({
      status: 429,
      responseBody: '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
    });

    const { ai } = await readyAi();
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(ai.isPaused(Date.parse("2026-10-27T12:30:00.000Z"))).toBe(false);
  });

  it("fails hard on a 4xx that a retry cannot fix", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText.mockRejectedValue({
      status: 400,
      message: "bad request",
    });

    const { ai } = await readyAi();
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: false,
    });

    expect(ai.isPaused(Date.parse("2026-10-27T12:01:59.000Z"))).toBe(false);
  });

  it("pauses after a transient provider failure so the job is retried", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText.mockRejectedValue({
      status: 503,
      message: "overloaded",
    });

    const { ai } = await readyAi();
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });

    expect(ai.isPaused(Date.parse("2026-10-27T12:01:59.000Z"))).toBe(true);
  });

  it("rejects an invalid key and falls through to the next provider", async () => {
    mocks.generateText
      .mockRejectedValueOnce({ status: 401, message: "bad key" })
      .mockResolvedValueOnce({ text: '{"description":"from openai"}' });

    const { ai, apiKeys } = await readyAi([
      candidate(),
      candidate({
        provider: "openai",
        keyId: "key-openai",
        updatedAt: Date.parse("2026-10-27T01:00:00.000Z"),
      }),
    ]);

    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: true,
      value: "from openai",
    });

    expect(apiKeys.useApiKey.mock.calls.map(([provider]) => provider)).toEqual([
      "google",
      "openai",
    ]);
    await expect(ai.status()).resolves.toMatchObject({
      enabled: true,
      provider: "openai",
      reason: "ok",
    });
  });

  it("reports every rejected key without pausing", async () => {
    mocks.generateText.mockRejectedValue({ status: 401, message: "bad key" });

    const { ai } = await readyAi();
    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });

    expect(ai.isPaused()).toBe(false);
    await expect(ai.status()).resolves.toMatchObject({
      enabled: false,
      reason: "key-rejected",
      pausedUntil: null,
      provider: "google",
    });
  });

  it("clears a pause when the key is edited", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText.mockRejectedValue({
      status: 429,
      responseBody: '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
    });

    const { ai, ownerService } = await readyAi();
    await ai.extractDescription("page");
    expect(ai.isPaused()).toBe(true);

    ownerService.candidates.mockResolvedValue([
      candidate({ updatedAt: Date.parse("2026-10-27T12:00:01.000Z") }),
    ]);
    await ai.refresh();

    expect(ai.isPaused()).toBe(false);
  });

  it("pauses one key while the next provider still succeeds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText
      .mockRejectedValueOnce({
        status: 429,
        responseBody: '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
      })
      .mockResolvedValueOnce({ text: '{"description":"from openai"}' });

    const { ai } = await readyAi([
      candidate(),
      candidate({
        provider: "openai",
        keyId: "key-openai",
        updatedAt: Date.parse("2026-10-27T01:00:00.000Z"),
      }),
    ]);

    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: true,
      value: "from openai",
    });
    await expect(ai.status()).resolves.toMatchObject({
      enabled: true,
      provider: "openai",
      reason: "ok",
    });
  });

  it("reports paused with the earliest expiry when every key is paused", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    mocks.generateText.mockRejectedValue({
      status: 429,
      responseBody: '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
    });

    const { ai } = await readyAi([
      candidate(),
      candidate({
        provider: "openai",
        keyId: "key-openai",
        updatedAt: Date.parse("2026-10-27T01:00:00.000Z"),
      }),
    ]);

    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });

    const status = await ai.status();
    expect(status).toMatchObject({
      enabled: false,
      reason: "paused",
      provider: "google",
      pausedUntil: new Date("2026-10-27T12:02:00.000Z").toISOString(),
    });
  });

  it("keeps a job retryable when the key vanishes mid-call", async () => {
    const { ai, apiKeys } = await readyAi();
    apiKeys.useApiKey.mockRejectedValue(
      new NotFoundException("No active API key"),
    );

    await expect(ai.extractDescription("page")).resolves.toEqual({
      ok: false,
      retryable: true,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("uses the key's model or the provider default", async () => {
    const { ai } = await readyAi([
      candidate({ model: "gemini-custom" }),
      candidate({
        provider: "openai",
        keyId: "key-openai",
        updatedAt: Date.parse("2026-10-27T01:00:00.000Z"),
      }),
    ]);

    await expect(ai.status()).resolves.toMatchObject({
      provider: "google",
      model: "gemini-custom",
    });

    const noModel = await readyAi();
    await expect(noModel.ai.status()).resolves.toMatchObject({
      model: PROVIDER_CONFIG.google.defaultModel,
    });
  });

  it("passes the owner id to useApiKey and never exposes key material", async () => {
    mocks.generateText.mockResolvedValue({ text: '{"description":"ok"}' });

    const { ai, apiKeys } = await readyAi();
    await ai.extractDescription("page");

    expect(apiKeys.useApiKey).toHaveBeenCalledWith(
      "google",
      expect.any(Function),
      owner.id,
    );
    expect(await ai.status()).not.toHaveProperty("key");
  });
});

describe("nextMidnightPacific", () => {
  it("returns the next Pacific midnight as a UTC instant", () => {
    expect(
      nextMidnightPacific(new Date("2026-10-27T12:00:00.000Z")).toISOString(),
    ).toBe("2026-10-28T07:00:00.000Z");
    expect(
      nextMidnightPacific(new Date("2026-01-15T12:00:00.000Z")).toISOString(),
    ).toBe("2026-01-16T08:00:00.000Z");
  });
});
