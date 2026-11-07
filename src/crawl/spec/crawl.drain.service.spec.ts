import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";
import type { TCompany, TJob } from "@/src/database/database.types";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));

vi.mock("../crawl.safe-fetch", () => ({ safeFetch: mocks.safeFetch }));

import type { CrawlAiService } from "../crawl.ai";
import { CrawlDrainService } from "../crawl.drain.service";

const companyOf = (overrides: Partial<TCompany> = {}): TCompany =>
  ({
    id: 1,
    name: "Acme",
    provider: "greenhouse",
    enabled: true,
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
    description: null,
    state: "none",
    stateChangedAt: new Date("2026-01-01"),
    missedCrawls: 0,
    closedAt: null,
    ...overrides,
  }) as TJob;

const ldPage = (description: string) =>
  `<html><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    description,
  })}</script></html>`;

/** Long enough to clear MIN_PLAIN_DESCRIPTION. */
const longText = "Backend role. ".repeat(30).trim();

const db = {
  count: vi.fn(),
  findAllByColumn: vi.fn(),
  update: vi.fn(),
};

const ai = {
  refresh: vi.fn(),
  isAvailable: vi.fn(() => false),
  isPaused: vi.fn(() => false),
  extractDescription: vi.fn(),
};

let service: CrawlDrainService;
let company: TCompany;
let jobs: TJob[] = [];

const useJobs = (overrides: Partial<TCompany> = {}, initial: TJob[] = []) => {
  company = companyOf(overrides);
  jobs = initial;
  db.update.mockImplementation(
    (table: string, data: Record<string, unknown>, filter: { id?: string }) => {
      if (table === "jobs") {
        jobs = jobs.map((job) =>
          job.id === filter.id ? { ...job, ...data } : job,
        );
      }
      return Promise.resolve([]);
    },
  );
  db.findAllByColumn.mockImplementation(
    (
      table: string,
      options?: { pagination?: { offset?: number; limit?: number } },
    ) => {
      if (table === "companies") return Promise.resolve([company]);
      if (table !== "jobs") return Promise.resolve([]);
      const offset = options?.pagination?.offset ?? 0;
      const limit = options?.pagination?.limit ?? 25;
      return Promise.resolve(
        jobs
          .filter((job) => job.state === "none")
          .slice(offset, offset + limit),
      );
    },
  );
  db.count.mockResolvedValue(
    initial.filter((job) => job.state === "none").length,
  );
};

const jobUpdates = () =>
  db.update.mock.calls.filter(([table]) => table === "jobs");

const jobQueryOffsets = (): number[] =>
  (
    db.findAllByColumn.mock.calls as [
      string,
      { pagination?: { offset?: number } }?,
    ][]
  )
    .filter(([table]) => table === "jobs")
    .map(([, options]) => options?.pagination?.offset ?? 0);

describe("CrawlDrainService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T10:00:00.000Z"));
    ai.isAvailable.mockReturnValue(false);
    ai.isPaused.mockReturnValue(false);
    service = new CrawlDrainService(
      db as unknown as IDatabaseService,
      ai as unknown as CrawlAiService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores the JSON-LD description and marks the job ok", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({
      text: ldPage("<p>Real description</p>"),
    });

    await service.drainCompany(company);

    expect(jobUpdates()).toEqual([
      [
        "jobs",
        {
          description: "Real description",
          state: "ok",
          stateChangedAt: expect.any(Date),
        },
        { id: "job-1", state: "none" },
        undefined,
        true,
      ],
    ]);
  });

  it("prefers the main element over the whole page", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({
      text: `<html><body><nav>Menu</nav><main><p>${longText}</p></main><footer>Foot</footer></body></html>`,
    });

    await service.drainCompany(company);

    expect(jobUpdates()[0][1]).toMatchObject({
      description: longText,
      state: "ok",
    });
  });

  it("ignores a short plain-text fallback", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({
      text: "<html><body><nav>Menu</nav><p>Enable JavaScript</p></body></html>",
    });

    await service.drainCompany(company);

    expect(jobUpdates()).toHaveLength(0);
    expect(jobs[0].state).toBe("none");
  });

  it("ignores whole-page text without a main or article element", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({
      text: `<html><body><p>${longText}</p></body></html>`,
    });

    await service.drainCompany(company);

    expect(jobUpdates()).toHaveLength(0);
    expect(jobs[0].state).toBe("none");
  });

  it("uses an article body when there is no main element", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({
      text: `<html><body><article><p>${longText}</p></article></body></html>`,
    });

    await service.drainCompany(company);

    expect(jobUpdates()[0][1]).toMatchObject({
      description: longText,
      state: "ok",
    });
  });

  it("leaves the job none and skips it while AI is disabled", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({ text: "<html></html>" });

    await service.drainCompany(company);
    vi.setSystemTime(new Date("2026-10-27T10:01:01.000Z"));
    await service.drainCompany(company);

    expect(jobUpdates()).toHaveLength(0);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("uses the AI description when the page has none", async () => {
    useJobs({}, [jobOf()]);
    ai.isAvailable.mockReturnValue(true);
    ai.extractDescription.mockResolvedValue({
      ok: true,
      value: "AI description",
    });
    mocks.safeFetch.mockResolvedValue({ text: "<html></html>" });

    await service.drainCompany(company);

    expect(jobUpdates()[0][1]).toMatchObject({
      description: "AI description",
      state: "ok",
    });
  });

  it("marks the job failed when AI returns nothing", async () => {
    useJobs({}, [jobOf()]);
    ai.isAvailable.mockReturnValue(true);
    ai.extractDescription.mockResolvedValue({
      ok: false,
      retryable: false,
    });
    mocks.safeFetch.mockResolvedValue({ text: "<html></html>" });

    await service.drainCompany(company);

    expect(jobUpdates()[0][1]).toMatchObject({ state: "failed" });
  });

  it("leaves the job none when the AI call paused on a 429", async () => {
    useJobs({}, [jobOf()]);
    ai.isAvailable.mockReturnValue(true);
    ai.extractDescription.mockResolvedValue({
      ok: false,
      retryable: true,
    });
    mocks.safeFetch.mockResolvedValue({ text: "<html></html>" });

    await service.drainCompany(company);

    expect(jobUpdates()).toHaveLength(0);
    expect(jobs[0].state).toBe("none");
  });

  it("marks the job failed when the fetch fails", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockRejectedValue(new Error("boom"));

    await service.drainCompany(company);

    expect(jobUpdates()[0][1]).toMatchObject({ state: "failed" });
  });

  it("orders pending jobs by created_at then id and skips closed rows", async () => {
    useJobs({}, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({ text: ldPage("First") });

    await service.drainCompany(company);

    const call = db.findAllByColumn.mock.calls.find(
      ([table]) => table === "jobs",
    );
    expect(call?.[1]).toMatchObject({
      filter: { companyId: 1, userId: null, state: "none", closedAt: null },
      sortBy: [
        { column: "createdAt", order: "asc" },
        { column: "id", order: "asc" },
      ],
    });
  });

  it("hands the AI page text instead of raw markup", async () => {
    useJobs({}, [jobOf()]);
    ai.isAvailable.mockReturnValue(true);
    ai.extractDescription.mockResolvedValue({
      ok: true,
      value: "AI description",
    });
    mocks.safeFetch.mockResolvedValue({
      text: `<html><head><script>var x = 1</script></head><body><p>Apply now</p></body></html>`,
    });

    await service.drainCompany(company);

    expect(ai.extractDescription).toHaveBeenCalledWith("Apply now");
  });

  it("strips NUL bytes from an AI description", async () => {
    useJobs({}, [jobOf()]);
    ai.isAvailable.mockReturnValue(true);
    ai.extractDescription.mockResolvedValue({
      ok: true,
      value: "AI\u0000 text",
    });
    mocks.safeFetch.mockResolvedValue({ text: "<html></html>" });

    await service.drainCompany(company);

    expect(jobUpdates()[0][1]).toMatchObject({ description: "AI text" });
  });

  it("keeps draining other companies when one throws", async () => {
    useJobs();
    db.count.mockResolvedValue(1);
    const second = companyOf({ id: 2, atsBoardId: "other" });
    db.findAllByColumn.mockResolvedValue([company, second]);
    const spy = vi
      .spyOn(service, "drainCompany")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(false);

    await service.runScheduledDrain();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(second);
  });

  it("drains jobs of a disabled company", async () => {
    useJobs({ enabled: false }, [jobOf()]);
    mocks.safeFetch.mockResolvedValue({ text: ldPage("Paused but queued") });

    await expect(service.drainCompany(company)).resolves.toBe(true);

    expect(jobUpdates()[0][1]).toMatchObject({ state: "ok" });
  });

  it("drains at most one job per company per minute", async () => {
    useJobs({}, [
      jobOf(),
      jobOf({
        id: "job-2",
        externalId: "2",
        url: "https://careers.example.com/jobs/2",
      }),
    ]);
    mocks.safeFetch.mockResolvedValue({ text: ldPage("First") });

    await service.drainCompany(company);
    await service.drainCompany(company);

    expect(jobUpdates()).toHaveLength(1);

    vi.setSystemTime(new Date("2026-10-27T10:01:01.000Z"));
    await service.drainCompany(company);

    expect(jobUpdates()).toHaveLength(2);
    expect(jobUpdates()[1][2]).toEqual({ id: "job-2", state: "none" });
  });

  it("claims the throttle before awaiting so concurrent callers cannot double-pick", async () => {
    useJobs({}, [
      jobOf(),
      jobOf({
        id: "job-2",
        externalId: "2",
        url: "https://careers.example.com/jobs/2",
      }),
    ]);
    mocks.safeFetch.mockResolvedValue({ text: ldPage("First") });

    await Promise.all([
      service.drainCompany(company),
      service.drainCompany(company),
    ]);

    expect(jobUpdates()).toHaveLength(1);
  });

  it("advances the cursor only past the jobs it skipped", async () => {
    useJobs({}, [
      jobOf(),
      jobOf({
        id: "job-2",
        externalId: "2",
        url: "https://careers.example.com/jobs/2",
      }),
      jobOf({
        id: "job-3",
        externalId: "3",
        url: "https://careers.example.com/jobs/3",
      }),
    ]);
    ai.isAvailable.mockReturnValue(false);
    mocks.safeFetch.mockResolvedValue({ text: "<html></html>" });

    await service.drainCompany(company);
    vi.setSystemTime(new Date("2026-10-27T10:01:01.000Z"));
    await service.drainCompany(company);
    vi.setSystemTime(new Date("2026-10-27T10:02:02.000Z"));
    await service.drainCompany(company);

    // job-1 stays `none` and skipped, so the second drain starts at 0 and the
    // third at 1; the page length would have moved it to 3 and wrapped.
    expect(jobQueryOffsets()).toEqual([0, 0, 1]);
  });

  it("is a no-op in app mode", async () => {
    useJobs();
    process.env.IS_APP_MODE = "true";
    try {
      await service.drainCompany(company);
      await service.runScheduledDrain();
      expect(db.findAllByColumn).not.toHaveBeenCalled();
    } finally {
      delete process.env.IS_APP_MODE;
    }
  });

  it("idles the scheduled tick when no system job is pending", async () => {
    useJobs();
    db.count.mockResolvedValue(0);

    await service.runScheduledDrain();
    expect(db.findAllByColumn).not.toHaveBeenCalled();

    db.count.mockResolvedValue(1);
    await service.runScheduledDrain();
    expect(db.findAllByColumn).toHaveBeenCalled();
  });

  it("does not overlap scheduled drains", async () => {
    useJobs({}, [jobOf()]);
    db.count.mockResolvedValue(1);
    mocks.safeFetch.mockResolvedValue({ text: ldPage("First") });

    let release!: (rows: TCompany[]) => void;
    db.findAllByColumn.mockImplementationOnce(
      () => new Promise<TCompany[]>((resolve) => (release = resolve)),
    );

    const first = service.runScheduledDrain();
    await service.runScheduledDrain();
    await Promise.resolve();
    await Promise.resolve();
    expect(db.findAllByColumn).toHaveBeenCalledTimes(1);

    release([company]);
    await first;
  });
});
