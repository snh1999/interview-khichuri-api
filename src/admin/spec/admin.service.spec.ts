import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrawlAiService } from "@/src/crawl/crawl.ai";
import { DATABASE_CONNECTION } from "@/src/database/database.constants";
import { IDatabaseService } from "@/src/database/database.service";

import { AdminService } from "../admin.service";

interface ISelectChain {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  then: (onFulfilled: (value: unknown) => unknown) => unknown;
  whereArg?: unknown;
  orderByArgs?: unknown[];
  limitArg?: number;
  offsetArg?: number;
}

function makeSelectChain(result: unknown): ISelectChain {
  const chain: ISelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((arg: unknown) => {
      chain.whereArg = arg;
      return chain;
    }),
    orderBy: vi.fn((...args: unknown[]) => {
      chain.orderByArgs = args;
      return chain;
    }),
    limit: vi.fn((n: number) => {
      chain.limitArg = n;
      return chain;
    }),
    offset: vi.fn((n: number) => {
      chain.offsetArg = n;
      return chain;
    }),
    then: (onFulfilled) => onFulfilled(result),
  };
  return chain;
}

function makeRow() {
  return {
    id: "u1",
    name: "Alice",
    email: "alice@example.com",
    emailVerified: true,
    image: null,
    role: "admin",
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

describe("AdminService", () => {
  let service: AdminService;
  const mockDb = {
    count: vi.fn(),
    findAllByColumn: vi.fn(),
    findById: vi.fn(),
    search: vi.fn(),
    update: vi.fn(),
  };
  const mockCrawlAi = {
    status: vi.fn(() =>
      Promise.resolve({
        enabled: true,
        pausedUntil: null,
        ownerEmail: "owner@test.dev",
        provider: "google",
        model: "gemini-test",
        reason: "ok",
      }),
    ),
  };
  const mockPg = { $count: vi.fn(), select: vi.fn(), selectDistinct: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: IDatabaseService, useValue: mockDb },
        { provide: DATABASE_CONNECTION, useValue: mockPg },
        { provide: CrawlAiService, useValue: mockCrawlAi },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  describe("getStats", () => {
    it("returns the full stats shape with a zero-filled 30-day signup window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-22T12:00:00.000Z"));
      mockPg.$count.mockResolvedValue(7);
      mockDb.count.mockResolvedValue(3);
      mockPg.select.mockReturnValue(
        makeSelectChain([{ createdAt: new Date("2026-10-22T01:00:00.000Z") }]),
      );

      const result = await service.getStats();

      expect(result.users).toEqual({
        total: 7,
        verified: 7,
        banned: 7,
        new7d: 7,
        new30d: 7,
        activeSessions: 7,
      });
      expect(result.usage).toEqual({
        jobs: 3,
        prepSessions: 3,
        interviews: 3,
        resumes: 3,
        notes: 3,
        prompts: 3,
        apiKeys: 3,
        companies: 3,
        calendarEvents: 3,
      });
      expect(result.signups).toHaveLength(30);
      expect(result.signups[29]).toEqual({ date: "2026-10-22", count: 1 });
      vi.useRealTimers();
    });
  });

  describe("findUsers", () => {
    it("composes filters into the where clause and applies pagination and sort", async () => {
      const chain = makeSelectChain([makeRow()]);
      mockPg.select.mockReturnValue(chain);
      mockPg.$count.mockResolvedValue(1);

      const result = await service.findUsers(
        { q: "ali", role: "admin", banned: true, verified: false },
        { offset: 20, limit: 10 },
        [{ column: "email", order: "desc" }],
      );

      expect(chain.whereArg).toBeDefined();
      expect(chain.orderByArgs).toHaveLength(1);
      expect(chain.limitArg).toBe(10);
      expect(chain.offsetArg).toBe(20);
      expect(mockPg.$count).toHaveBeenCalledWith(
        expect.anything(),
        chain.whereArg,
      );
      expect(result.total).toBe(1);
      expect(result.users).toHaveLength(1);
    });

    it("defaults pagination and omits the where clause when no filters are given", async () => {
      const chain = makeSelectChain([]);
      mockPg.select.mockReturnValue(chain);
      mockPg.$count.mockResolvedValue(0);

      await service.findUsers({});

      expect(chain.whereArg).toBeUndefined();
      expect(chain.limitArg).toBe(20);
      expect(chain.offsetArg).toBe(0);
    });

    it("maps rows to the admin user contract without credential fields", async () => {
      mockPg.select.mockReturnValue(makeSelectChain([makeRow()]));
      mockPg.$count.mockResolvedValue(1);

      const { users } = await service.findUsers({});

      expect(users[0]).toEqual({
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        emailVerified: true,
        image: null,
        role: "admin",
        banned: false,
        banReason: null,
        banExpires: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      expect(users[0]).not.toHaveProperty("password");
    });
  });

  describe("findUser", () => {
    it("throws NotFoundException for an unknown user", async () => {
      mockPg.select.mockReturnValue(makeSelectChain([]));

      await expect(service.findUser("missing")).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPg.$count).not.toHaveBeenCalled();
    });

    it("returns user detail with profile, counts, providers and passkeys", async () => {
      mockPg.select
        .mockReturnValueOnce(makeSelectChain([makeRow()]))
        .mockReturnValueOnce(
          makeSelectChain([
            {
              firstName: "Alice",
              lastName: null,
              location: null,
              country: "US",
            },
          ]),
        );
      mockPg.selectDistinct.mockReturnValue(
        makeSelectChain([
          { providerId: "google" },
          { providerId: "credential" },
        ]),
      );
      mockPg.$count.mockResolvedValue(2);

      const result = await service.findUser("u1");

      expect(result.user.id).toBe("u1");
      expect(result.profile).toEqual({
        firstName: "Alice",
        lastName: null,
        location: null,
        country: "US",
      });
      expect(result.providers).toEqual(["google", "credential"]);
      expect(result.passkeys).toBe(2);
      expect(result.counts).toEqual({
        jobs: 2,
        prepSessions: 2,
        interviews: 2,
        resumes: 2,
        notes: 2,
        prompts: 2,
        apiKeys: 2,
        calendarEvents: 2,
      });
    });
  });

  describe("admin jobs", () => {
    const systemJob = {
      id: "job-1",
      userId: null,
      title: "Engineer",
      companyName: "Acme",
      description: "desc",
      state: "failed",
    };
    const privateJob = { ...systemJob, userId: "user-1" };

    it("lists failed system jobs", async () => {
      mockDb.findAllByColumn.mockResolvedValue([systemJob]);

      const result = await service.findFailedJobs();

      expect(result).toEqual([systemJob]);
      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { userId: null, state: "failed" },
        sortBy: [{ column: "stateChangedAt", order: "desc" }],
      });
    });

    it("applies the requested sort to a job search", async () => {
      mockDb.search.mockResolvedValue({ data: [systemJob], total: 1 });
      const sort = [{ column: "title", order: "asc" as const }];

      const result = await service.findSystemJobs(
        { q: "eng" },
        { limit: 20, offset: 0 },
        sort,
      );

      expect(mockDb.search).toHaveBeenCalledWith(
        "jobs",
        ["title", "companyName"],
        "eng",
        {
          filter: { userId: null },
          pagination: { limit: 20, offset: 0 },
          sortBy: sort,
        },
      );
      expect(result).toEqual({ items: [systemJob], total: 1 });
    });

    it("retries a failed system job", async () => {
      mockDb.findById.mockResolvedValue(systemJob);
      mockDb.update.mockResolvedValue([
        { ...systemJob, state: "none", stateChangedAt: new Date() },
      ]);

      await service.retryFailedJob("job-1");

      expect(mockDb.update).toHaveBeenCalledWith(
        "jobs",
        { state: "none", stateChangedAt: expect.any(Date) },
        { id: "job-1", userId: null },
      );
    });

    it("stores a pasted description and marks the job ok", async () => {
      mockDb.findById.mockResolvedValue(systemJob);
      mockDb.update.mockResolvedValue([
        { ...systemJob, description: "desc", state: "ok" },
      ]);

      await service.setJobDescription("job-1", { description: "desc" });

      expect(mockDb.update).toHaveBeenCalledWith(
        "jobs",
        {
          description: "desc",
          state: "ok",
          stateChangedAt: expect.any(Date),
        },
        { id: "job-1", userId: null },
      );
    });

    it("does not expose a private job to the admin endpoints", async () => {
      mockDb.findById.mockResolvedValue(privateJob);

      await expect(service.retryFailedJob("job-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("returns the AI status", async () => {
      await expect(service.getAiStatus()).resolves.toEqual({
        enabled: true,
        pausedUntil: null,
        ownerEmail: "owner@test.dev",
        provider: "google",
        model: "gemini-test",
        reason: "ok",
      });
    });
  });
});
