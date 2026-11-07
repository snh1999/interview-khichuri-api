import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";
import type { TCompany, TJob } from "@/src/database/database.types";

const mocks = vi.hoisted(() => ({
  fetchAtsListing: vi.fn(),
  safeFetch: vi.fn(),
  scrapeListing: vi.fn(),
  extractAnchors: vi.fn(),
  htmlToText: vi.fn((html: string) => html),
}));

vi.mock("../crawl.ats", () => ({
  ATS_BOARD_ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  fetchAtsListing: mocks.fetchAtsListing,
}));
vi.mock("../crawl.safe-fetch", () => ({
  safeFetch: mocks.safeFetch,
  CrawlFetchError: class CrawlFetchError extends Error {},
}));
vi.mock("../crawl.scrape", () => ({
  scrapeListing: mocks.scrapeListing,
  extractAnchors: mocks.extractAnchors,
  htmlToText: mocks.htmlToText,
}));

import type { CrawlAiService } from "../crawl.ai";
import { hashListing } from "../crawl.constants";
import type { TListingItem } from "../crawl.constants";
import type { CrawlDrainService } from "../crawl.drain.service";
import { CrawlService } from "../crawl.service";

const companyOf = (overrides: Partial<TCompany> = {}): TCompany =>
  ({
    id: 1,
    name: "Acme",
    provider: "greenhouse",
    atsBoardId: "acme",
    careerPageUrl: null,
    enabled: true,
    feed: null,
    hash: null,
    crawledAt: null,
    crawlError: null,
    ...overrides,
  }) as TCompany;

const jobOf = (overrides: Partial<TJob> = {}): TJob =>
  ({
    id: "job-1",
    userId: null,
    companyId: 1,
    companyName: "Acme",
    provider: "greenhouse",
    externalId: "1",
    url: "https://careers.example.com/jobs/1",
    title: "Engineer",
    location: null,
    description: null,
    state: "none",
    stateChangedAt: new Date("2026-01-01"),
    missedCrawls: 0,
    closedAt: null,
    ...overrides,
  }) as TJob;

const itemOf = (overrides: Partial<TListingItem> = {}): TListingItem => ({
  externalId: "1",
  url: "https://careers.example.com/jobs/1",
  title: "Engineer",
  location: null,
  description: null,
  ...overrides,
});

const tx = {};
const db = {
  findById: vi.fn(),
  findAllByColumn: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  withTransaction: vi.fn(async (fn: (client: object) => Promise<unknown>) =>
    fn(tx),
  ),
};
const ai = {
  refresh: vi.fn(),
  isAvailable: vi.fn(() => false),
  extractListing: vi.fn(),
  extractDescription: vi.fn(),
};
const drain = { drainCompany: vi.fn() };

const service = new CrawlService(
  db as unknown as IDatabaseService,
  ai as unknown as CrawlAiService,
  drain as unknown as CrawlDrainService,
);

const useCompanies = (company: TCompany | null, jobs: TJob[] = []) => {
  db.findById.mockResolvedValue(company);
  db.findAllByColumn.mockImplementation((table: string) =>
    Promise.resolve(table === "jobs" ? jobs : []),
  );
};

const companiesUpdate = () =>
  db.update.mock.calls.find(([table]) => table === "companies");

describe("CrawlService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.withTransaction.mockImplementation(
      async (fn: (client: object) => Promise<unknown>) => fn(tx),
    );
  });

  it("inserts new system jobs and records feed, hash and crawl time", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf(),
      itemOf({
        externalId: "2",
        url: "https://careers.example.com/jobs/2",
      }),
    ]);

    await service.crawlCompany(1);

    expect(db.create).toHaveBeenCalledTimes(2);
    expect(db.create).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({
        companyId: 1,
        provider: "greenhouse",
        userId: null,
        state: "none",
        externalId: "1",
      }),
      tx,
    );

    const [, data, filter] = companiesUpdate() ?? [];
    expect(data).toMatchObject({
      hash: expect.any(String),
      crawledAt: expect.any(Date),
      crawlError: null,
    });
    expect(filter).toEqual({ id: 1 });
    expect(drain.drainCompany).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
    );
  });

  it("matches ATS rows by external id and moves the URL", async () => {
    useCompanies(companyOf(), [
      jobOf({ url: "https://careers.example.com/jobs/old" }),
    ]);
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf({ url: "https://careers.example.com/jobs/new" }),
    ]);

    await service.crawlCompany(1);

    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { url: "https://careers.example.com/jobs/new" },
      { id: "job-1" },
      tx,
    );
  });

  it("moves a none ATS job to ok when a description arrives", async () => {
    useCompanies(companyOf(), [jobOf()]);
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf({ description: "Full posting body" }),
    ]);

    await service.crawlCompany(1);

    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({
        description: "Full posting body",
        state: "ok",
        stateChangedAt: expect.any(Date),
      }),
      { id: "job-1" },
      tx,
    );
  });

  it("increments missed crawls and closes a job after the second miss", async () => {
    useCompanies(companyOf(), [
      jobOf(),
      jobOf({
        id: "job-2",
        externalId: "2",
        url: "https://careers.example.com/jobs/2",
        missedCrawls: 1,
      }),
    ]);
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    await service.crawlCompany(1);

    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { missedCrawls: 2, closedAt: expect.any(Date) },
      { id: "job-2" },
      tx,
    );
  });

  it("counts misses and closes jobs when a valid ATS board is empty", async () => {
    useCompanies(companyOf(), [jobOf({ missedCrawls: 1 })]);
    mocks.fetchAtsListing.mockResolvedValue([]);

    await service.crawlCompany(1);

    expect(db.withTransaction).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { missedCrawls: 2, closedAt: expect.any(Date) },
      { id: "job-1" },
      tx,
    );
    const [, data] = companiesUpdate() ?? [];
    expect(data).toMatchObject({ feed: [], crawlError: null });
  });

  it("skips the closes when the 50% guard trips and writes no feed", async () => {
    const jobs = Array.from({ length: 10 }, (_, index) =>
      jobOf({
        id: `job-${index}`,
        externalId: String(index),
        url: `https://careers.example.com/jobs/${index}`,
        missedCrawls: 1,
      }),
    );
    useCompanies(companyOf(), jobs);
    mocks.fetchAtsListing.mockResolvedValue(
      jobs
        .slice(0, 4)
        .map((job) =>
          itemOf({ externalId: job.externalId, url: job.url ?? "" }),
        ),
    );

    await service.crawlCompany(1);

    const closeUpdates = db.update.mock.calls.filter(
      ([table, data]) =>
        table === "jobs" &&
        (data as { missedCrawls?: number }).missedCrawls === 2,
    );
    expect(closeUpdates).toHaveLength(6);
    for (const [, data] of closeUpdates) {
      expect(data).not.toHaveProperty("closedAt");
    }

    const [, data] = companiesUpdate() ?? [];
    expect(data).toEqual({
      crawlError: expect.stringContaining("Close guard tripped"),
    });
  });

  it("lets a forced crawl bypass the guard and disabled flag", async () => {
    const jobs = Array.from({ length: 10 }, (_, index) =>
      jobOf({
        id: `job-${index}`,
        externalId: String(index),
        url: `https://careers.example.com/jobs/${index}`,
        missedCrawls: 1,
      }),
    );
    useCompanies(companyOf({ enabled: false }), jobs);
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    await service.crawlCompany(1, { force: true });

    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { missedCrawls: 2, closedAt: expect.any(Date) },
      { id: "job-0" },
      tx,
    );
    const [, data] = companiesUpdate() ?? [];
    expect(data).toMatchObject({ crawlError: null });
  });

  it("requeues a still-listed job when a forced crawl finds it failed", async () => {
    useCompanies(companyOf({ enabled: false }), [jobOf({ state: "failed" })]);
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    await service.crawlCompany(1, { force: true });

    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { state: "none", stateChangedAt: expect.any(Date) },
      { id: "job-1" },
      tx,
    );
  });

  it("leaves failed jobs alone on a scheduled crawl", async () => {
    useCompanies(companyOf(), [jobOf({ state: "failed" })]);
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    await service.crawlCompany(1);

    const jobWrites = db.update.mock.calls.filter(
      ([table]) => table === "jobs",
    );
    expect(jobWrites).toHaveLength(0);
  });

  it("replaces the old description when a new posting reuses its URL", async () => {
    useCompanies(companyOf(), [
      jobOf({
        id: "job-2",
        externalId: "2",
        url: "https://x.test/jobs/taken",
        description: "Old body",
        state: "failed",
        missedCrawls: 2,
        closedAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ]);
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf({
        externalId: "1",
        url: "https://x.test/jobs/taken",
        title: "Re-listed",
        location: "Remote",
        description: "Fresh body",
      }),
    ]);

    await service.crawlCompany(1);

    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      {
        externalId: "1",
        provider: "greenhouse",
        title: "Re-listed",
        location: "Remote",
        description: "Fresh body",
        state: "ok",
        stateChangedAt: expect.any(Date),
        missedCrawls: 0,
        closedAt: null,
      },
      { id: "job-2" },
      tx,
    );
  });

  it("adopts a scrape-era row when a company switches to an ATS provider", async () => {
    useCompanies(companyOf(), [
      jobOf({ id: "job-2", externalId: null, provider: "scrape" }),
    ]);
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    await service.crawlCompany(1);

    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({ externalId: "1", provider: "greenhouse" }),
      { id: "job-2" },
      tx,
    );
  });

  it("does not adopt a same-id job from another provider", async () => {
    useCompanies(companyOf({ provider: "lever" }), [
      jobOf({
        id: "job-old",
        externalId: "1",
        provider: "greenhouse",
        url: "https://greenhouse.test/jobs/1",
      }),
    ]);
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf({ externalId: "1", url: "https://lever.test/jobs/1" }),
    ]);

    await service.crawlCompany(1);

    expect(db.create).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({
        externalId: "1",
        provider: "lever",
        url: "https://lever.test/jobs/1",
      }),
      tx,
    );
    expect(db.update).not.toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({ provider: "lever" }),
      { id: "job-old" },
      tx,
    );
  });

  it("fails the crawl when two feed jobs claim the same URL", async () => {
    useCompanies(companyOf(), [
      jobOf({ id: "job-2", externalId: "2", url: "https://x.test/jobs/taken" }),
    ]);
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf({ externalId: "2", url: "https://x.test/jobs/moved" }),
      itemOf({ externalId: "1", url: "https://x.test/jobs/taken" }),
    ]);

    await service.crawlCompany(1);

    expect(db.withTransaction).not.toHaveBeenCalled();
    const [, data] = companiesUpdate() ?? [];
    expect(data).toEqual({
      crawlError: expect.stringContaining("already belongs to another"),
    });
  });

  it("applies a freshly arrived description even when the hash matches", async () => {
    const items = [itemOf({ description: "Fresh body" })];
    useCompanies(
      companyOf({
        hash: hashListing(items),
        feed: items.map(({ url, externalId, title, location }) => ({
          url,
          externalId,
          title,
          location,
        })),
        crawledAt: new Date("2026-10-26T00:00:00.000Z"),
      }),
      [
        jobOf(),
        jobOf({
          id: "job-2",
          externalId: "2",
          url: "https://careers.example.com/jobs/2",
        }),
      ],
    );
    mocks.fetchAtsListing.mockResolvedValue(items);

    await service.crawlCompany(1);

    expect(db.create).not.toHaveBeenCalled();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({
        description: "Fresh body",
        state: "ok",
      }),
      { id: "job-1" },
      tx,
    );
    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { missedCrawls: 1 },
      { id: "job-2" },
      tx,
    );
  });

  it("reopens a closed system job on a hash match", async () => {
    const items = [itemOf()];
    useCompanies(companyOf({ hash: hashListing(items), feed: items }), [
      jobOf({
        missedCrawls: 2,
        closedAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ]);
    mocks.fetchAtsListing.mockResolvedValue(items);

    await service.crawlCompany(1);

    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { missedCrawls: 0, closedAt: null },
      { id: "job-1" },
      tx,
    );
  });

  it("re-diffs after a guard trip and clears the error on the next good crawl", async () => {
    const jobs = Array.from({ length: 10 }, (_, index) =>
      jobOf({
        id: `job-${index}`,
        externalId: String(index),
        url: `https://careers.example.com/jobs/${index}`,
        missedCrawls: 1,
      }),
    );
    const items = jobs.map((job) =>
      itemOf({ externalId: job.externalId, url: job.url ?? "" }),
    );
    useCompanies(companyOf(), jobs);
    mocks.fetchAtsListing
      .mockResolvedValueOnce(items.slice(0, 4))
      .mockResolvedValueOnce(items);

    await service.crawlCompany(1);
    await service.crawlCompany(1);

    const companyWrites = db.update.mock.calls.filter(
      ([table]) => table === "companies",
    );
    expect(companyWrites).toHaveLength(2);
    expect(companyWrites[0][1]).toEqual({
      crawlError: expect.stringContaining("Close guard tripped"),
    });
    expect(companyWrites[1][1]).toMatchObject({
      crawlError: null,
      feed: expect.any(Array),
      hash: expect.any(String),
      crawledAt: expect.any(Date),
    });
    expect(mocks.fetchAtsListing).toHaveBeenCalledTimes(2);
  });

  it("increments misses and closes a scrape job after the second miss", async () => {
    useCompanies(
      companyOf({ provider: "scrape", careerPageUrl: "https://x.test/jobs" }),
      [
        jobOf({ url: "https://x.test/jobs/1", missedCrawls: 1 }),
        jobOf({
          id: "job-2",
          externalId: null,
          provider: "scrape",
          url: "https://x.test/jobs/2",
          missedCrawls: 1,
        }),
      ],
    );
    mocks.safeFetch.mockResolvedValue({
      url: "https://x.test/jobs",
      text: "<html></html>",
    });
    mocks.scrapeListing.mockReturnValue([
      itemOf({ externalId: null, url: "https://x.test/jobs/1" }),
    ]);

    await service.crawlCompany(1);

    expect(db.update).toHaveBeenCalledWith(
      "jobs",
      { missedCrawls: 2, closedAt: expect.any(Date) },
      { id: "job-2" },
      tx,
    );
  });

  it("fails the crawl over the link cap", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockResolvedValue(
      Array.from({ length: 1_001 }, (_, index) =>
        itemOf({
          externalId: String(index),
          url: `https://careers.example.com/jobs/${index}`,
        }),
      ),
    );

    await service.crawlCompany(1);

    expect(db.withTransaction).not.toHaveBeenCalled();
    const [, data] = companiesUpdate() ?? [];
    expect(data).toEqual({ crawlError: expect.stringContaining("1000 cap") });
  });

  it("fails the crawl over the new-jobs cap once crawled_at is set", async () => {
    useCompanies(
      companyOf({ crawledAt: new Date("2026-10-26T00:00:00.000Z") }),
    );
    mocks.fetchAtsListing.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) =>
        itemOf({
          externalId: String(index),
          url: `https://careers.example.com/jobs/${index}`,
        }),
      ),
    );

    await service.crawlCompany(1);

    expect(db.create).not.toHaveBeenCalled();
    const [, data] = companiesUpdate() ?? [];
    expect(data).toEqual({ crawlError: expect.stringContaining("500 cap") });
  });

  it("lets a first crawl exceed the new-jobs cap", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) =>
        itemOf({
          externalId: String(index),
          url: `https://careers.example.com/jobs/${index}`,
        }),
      ),
    );

    await service.crawlCompany(1);

    expect(db.create).toHaveBeenCalledTimes(501);
  });

  it("marks an ATS job ok when the listing already has a description", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf({ description: "Full posting body" }),
    ]);

    await service.crawlCompany(1);

    expect(db.create).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({
        state: "ok",
        description: "Full posting body",
      }),
      tx,
    );
  });

  it("never stores a JSON-LD identifier as the external id of a scrape row", async () => {
    useCompanies(
      companyOf({ provider: "scrape", careerPageUrl: "https://x.test/jobs" }),
    );
    mocks.safeFetch.mockResolvedValue({
      url: "https://x.test/jobs",
      text: "<html></html>",
    });
    mocks.scrapeListing.mockReturnValue([
      itemOf({ externalId: "1", description: null }),
    ]);

    await service.crawlCompany(1);

    expect(db.create).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({ externalId: null, state: "none" }),
      tx,
    );
  });

  it("records AI unavailable when a scrape finds no listings and AI is off", async () => {
    useCompanies(
      companyOf({ provider: "scrape", careerPageUrl: "https://x.test/jobs" }),
    );
    mocks.safeFetch.mockResolvedValue({
      url: "https://x.test/jobs",
      text: "<html></html>",
    });
    mocks.scrapeListing.mockReturnValue([]);

    await service.crawlCompany(1);

    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(mocks.extractAnchors).not.toHaveBeenCalled();
    const [, data] = companiesUpdate() ?? [];
    expect(data).toEqual({ crawlError: "AI unavailable" });
  });

  it("records a normal zero when AI also finds no listings", async () => {
    useCompanies(
      companyOf({ provider: "scrape", careerPageUrl: "https://x.test/jobs" }),
    );
    mocks.safeFetch.mockResolvedValue({
      url: "https://x.test/jobs",
      text: "<html></html>",
    });
    mocks.scrapeListing.mockReturnValue([]);
    mocks.extractAnchors.mockReturnValue([]);
    ai.isAvailable.mockReturnValue(true);
    ai.extractListing.mockResolvedValue({ ok: true, value: [] });

    await service.crawlCompany(1);

    const [, data] = companiesUpdate() ?? [];
    expect(data).toEqual({
      crawlError: "No job listings found on the career page",
    });
  });

  it("falls back to AI over every same-host link, with sanitized text", async () => {
    useCompanies(
      companyOf({ provider: "scrape", careerPageUrl: "https://x.test/jobs" }),
    );
    mocks.safeFetch.mockResolvedValue({
      url: "https://x.test/jobs",
      text: "<html><body><nav>Menu</nav></body></html>",
    });
    mocks.scrapeListing.mockReturnValue([]);
    mocks.extractAnchors.mockReturnValue([
      { url: "https://x.test/careers/backend", title: "Backend" },
    ]);
    mocks.htmlToText.mockReturnValue("Menu");
    ai.isAvailable.mockReturnValue(true);
    ai.extractListing.mockResolvedValue({
      ok: true,
      value: [
        itemOf({ externalId: null, url: "https://x.test/careers/backend" }),
      ],
    });

    await service.crawlCompany(1);

    expect(mocks.extractAnchors).toHaveBeenCalledWith(
      "<html><body><nav>Menu</nav></body></html>",
      "https://x.test/jobs",
      true,
    );
    expect(ai.extractListing).toHaveBeenCalledWith("Menu", [
      { url: "https://x.test/careers/backend", title: "Backend" },
    ]);
    expect(db.create).toHaveBeenCalledTimes(1);
  });

  it("does not count misses from a capped AI listing", async () => {
    useCompanies(
      companyOf({ provider: "scrape", careerPageUrl: "https://x.test/jobs" }),
      [
        jobOf({
          id: "job-missing",
          externalId: "999",
          url: "https://x.test/jobs/999",
        }),
      ],
    );
    mocks.safeFetch.mockResolvedValue({
      url: "https://x.test/jobs",
      text: "<html></html>",
    });
    mocks.scrapeListing.mockReturnValue([]);
    mocks.extractAnchors.mockReturnValue([
      { url: "https://x.test/jobs/0", title: "Job 0" },
    ]);
    mocks.htmlToText.mockReturnValue("Jobs");
    ai.isAvailable.mockReturnValue(true);
    ai.extractListing.mockResolvedValue({
      ok: true,
      value: Array.from({ length: 100 }, (_, index) =>
        itemOf({
          externalId: String(index),
          url: `https://x.test/jobs/${index}`,
        }),
      ),
    });

    await service.crawlCompany(1);

    expect(
      db.update.mock.calls.filter(([table]) => table === "jobs"),
    ).toHaveLength(0);
    const [, data] = companiesUpdate() ?? [];
    expect(data).toMatchObject({ crawlError: null });
  });

  it("strips NUL bytes before they reach Postgres", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockResolvedValue([
      itemOf({
        title: "Eng\u0000ineer",
        location: "\u0000Remote",
        description: "Body\u0000 text",
      }),
    ]);

    await service.crawlCompany(1);

    expect(db.create).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({
        title: "Engineer",
        location: "Remote",
        description: "Body text",
      }),
      tx,
    );
  });

  it("keeps the crawl result when the follow-up drain throws", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);
    drain.drainCompany.mockRejectedValueOnce(new Error("drain boom"));

    await service.crawlCompany(1);

    const companyWrites = db.update.mock.calls.filter(
      ([table]) => table === "companies",
    );
    expect(companyWrites).toHaveLength(1);
    expect(companyWrites[0][1]).toMatchObject({ crawlError: null });
  });

  it("does not start a second crawl while one is in flight", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    let release!: (company: TCompany | null) => void;
    db.findById.mockImplementationOnce(
      () => new Promise<TCompany | null>((resolve) => (release = resolve)),
    );

    const first = service.crawlCompany(1);
    await service.crawlCompany(1);
    expect(db.findById).toHaveBeenCalledTimes(1);

    release(companyOf());
    await first;
  });

  it("does nothing when the company has no provider", async () => {
    useCompanies(companyOf({ provider: null }));

    await service.crawlCompany(1);

    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a manual crawl of a scrape company without a URL", async () => {
    useCompanies(companyOf({ careerPageUrl: null, provider: "scrape" }));

    await expect(service.crawlCompany(1, { rethrow: true })).rejects.toThrow(
      "no career page URL",
    );

    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it("surfaces crawl failures to a manual caller", async () => {
    useCompanies(companyOf());
    mocks.fetchAtsListing.mockRejectedValue(new Error("listing down"));

    await expect(
      service.crawlCompany(1, { force: true, rethrow: true }),
    ).rejects.toThrow("listing down");
  });

  it("is a no-op in app mode", async () => {
    process.env.IS_APP_MODE = "true";
    try {
      await service.crawlCompany(1);
      await service.runScheduledCrawl();
      expect(db.findById).not.toHaveBeenCalled();
      expect(db.findAllByColumn).not.toHaveBeenCalled();
    } finally {
      delete process.env.IS_APP_MODE;
    }
  });

  it("only crawls due, enabled companies on the scheduled tick", async () => {
    const stale = companyOf({ id: 1, crawledAt: new Date("2020-01-01") });
    const fresh = companyOf({
      id: 2,
      crawledAt: new Date(),
      atsBoardId: "fresh",
    });
    const disabled = companyOf({
      id: 3,
      enabled: false,
      crawledAt: new Date("2020-01-01"),
      atsBoardId: "off",
    });
    db.findAllByColumn.mockImplementation((table: string) =>
      Promise.resolve(table === "companies" ? [stale, fresh, disabled] : []),
    );
    db.findById.mockResolvedValue(stale);
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    await service.runScheduledCrawl();

    expect(db.findById).toHaveBeenCalledTimes(1);
    expect(db.findById).toHaveBeenCalledWith("companies", 1);
  });

  it("crawls a company that was never crawled", async () => {
    const fresh = companyOf({ id: 4, crawledAt: null, atsBoardId: "new" });
    db.findAllByColumn.mockImplementation((table: string) =>
      Promise.resolve(table === "companies" ? [fresh] : []),
    );
    db.findById.mockResolvedValue(fresh);
    mocks.fetchAtsListing.mockResolvedValue([itemOf()]);

    await service.runScheduledCrawl();

    expect(db.findById).toHaveBeenCalledWith("companies", 4);
  });

  it("backs off a failed crawl for six hours", async () => {
    const broken = companyOf({ id: 9, crawledAt: new Date("2020-01-01") });
    db.findAllByColumn.mockImplementation((table: string) =>
      Promise.resolve(table === "companies" ? [broken] : []),
    );
    db.findById.mockResolvedValue(broken);
    mocks.fetchAtsListing.mockRejectedValue(new Error("boom"));

    await service.runScheduledCrawl();
    expect(mocks.fetchAtsListing).toHaveBeenCalledTimes(1);

    // What `_recordCrawlError` wrote; `crawledAt` stays untouched.
    broken.crawlError = "boom";

    await service.runScheduledCrawl();
    expect(mocks.fetchAtsListing).toHaveBeenCalledTimes(1);
  });

  it("keeps crawling later companies when recording an error fails", async () => {
    const first = companyOf({ id: 1, crawledAt: new Date("2020-01-01") });
    const second = companyOf({
      id: 2,
      atsBoardId: "two",
      crawledAt: new Date("2020-01-01"),
    });
    db.findAllByColumn.mockImplementation((table: string) =>
      Promise.resolve(table === "companies" ? [first, second] : []),
    );
    db.findById.mockImplementation((_table: string, id: number) =>
      Promise.resolve(id === 1 ? first : second),
    );
    mocks.fetchAtsListing.mockRejectedValue(new Error("boom"));
    db.update.mockRejectedValue(new Error("company gone"));

    await service.runScheduledCrawl();

    expect(mocks.fetchAtsListing).toHaveBeenCalledTimes(2);
  });
});
