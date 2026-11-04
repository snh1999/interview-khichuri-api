import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";
import { ResumeService } from "@/src/resume/resume.service";

import type { CreateJobDto } from "./jobs.dto";
import { JobsService } from "./jobs.service";
import { IDatabaseService } from "../database/database.service";
import type { TJob, TTrackedJob } from "../database/database.types";

const baseJob = {
  id: "job-1",
  userId: "user-1",
  title: "Engineer",
  companyName: "Acme",
  description: "desc",
  companyId: null,
  roleId: null,
  state: "ok",
  closedAt: null,
  deadline: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as unknown as TJob;

const baseTrack = {
  id: "track-1",
  userId: "user-1",
  jobId: "job-1",
  status: "saved",
  isFavorite: false,
  notes: null,
  appliedAt: null,
  interviewDate: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as unknown as TTrackedJob;

describe("JobsService", () => {
  let service: JobsService;
  const mockTransaction: object = {};
  const mockDb = {
    create: vi.fn(),
    findAllByColumn: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    database: vi.fn(),
    dbPing: vi.fn(),
    dbClear: vi.fn(),
    syncJunctionTable: vi.fn(),
    count: vi.fn(),
    search: vi.fn(),
    withTransaction: vi.fn((cb: (transaction: object) => unknown) =>
      cb(mockTransaction),
    ),
  };
  const mockGenAiService = {
    extractJob: vi.fn(),
    generateStructured: vi.fn(),
  };
  const mockLookupsService = {
    resolveOrCreateNames: vi.fn().mockResolvedValue([]),
    resolveOrCreateName: vi.fn().mockResolvedValue(null),
  };
  const mockResumeService = {
    resumeToText: vi.fn().mockResolvedValue("RESUME TEXT"),
  };

  const createDto: CreateJobDto = {
    title: "Engineer",
    companyName: "Acme",
    description: "desc",
    status: "saved",
    isFavorite: false,
    topicIds: [1],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.count.mockResolvedValue(0);
    mockDb.create.mockImplementation((table: string) =>
      Promise.resolve(table === "jobs" ? baseJob : baseTrack),
    );
    mockDb.findById.mockResolvedValue(baseJob);
    mockDb.findAllByColumn.mockResolvedValue([baseTrack]);

    const module = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: IDatabaseService, useValue: mockDb },
        { provide: GenAiService, useValue: mockGenAiService },
        { provide: LookupsService, useValue: mockLookupsService },
        { provide: ResumeService, useValue: mockResumeService },
      ],
    }).compile();

    service = module.get(JobsService);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("create", () => {
    it("creates a private job with its track and topics", async () => {
      await service.create(createDto, "user-1");

      expect(mockDb.create).toHaveBeenNthCalledWith(
        1,
        "jobs",
        expect.objectContaining({
          userId: "user-1",
          provider: "manual",
          state: "ok",
        }),
        mockTransaction,
      );
      expect(mockDb.create).toHaveBeenNthCalledWith(
        2,
        "tracked_jobs",
        expect.objectContaining({ userId: "user-1", jobId: "job-1" }),
        mockTransaction,
      );
      expect(mockDb.syncJunctionTable).toHaveBeenCalledWith(
        "job_topics",
        { column: "jobId", value: "job-1" },
        "topicId",
        [1],
        mockTransaction,
      );
    });

    it("defaults to the local actor when no user is provided", async () => {
      mockDb.findById.mockResolvedValue({ ...baseJob, userId: "local" });

      await service.create(createDto);

      expect(mockDb.create).toHaveBeenNthCalledWith(
        1,
        "jobs",
        expect.objectContaining({ userId: "local" }),
        mockTransaction,
      );
    });

    it("rejects when the track cap is reached", async () => {
      mockDb.count.mockResolvedValue(200);

      await expect(service.create(createDto, "user-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockDb.create).not.toHaveBeenCalled();
    });
  });

  describe("trackJob", () => {
    const systemJob = { ...baseJob, userId: null } as unknown as TJob;

    it("creates a track for an open system job", async () => {
      mockDb.findById.mockResolvedValue(systemJob);
      mockDb.findAllByColumn
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([baseTrack]);

      await service.trackJob("job-1", "user-1");

      expect(mockDb.create).toHaveBeenCalledWith("tracked_jobs", {
        userId: "user-1",
        jobId: "job-1",
      });
    });

    it("returns the existing track", async () => {
      mockDb.findAllByColumn.mockResolvedValue([baseTrack]);

      await service.trackJob("job-1", "user-1");

      expect(mockDb.create).not.toHaveBeenCalled();
    });

    it("rejects a private job", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.findById.mockResolvedValue(baseJob);

      await expect(service.trackJob("job-1", "user-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects a closed job", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.findById.mockResolvedValue({
        ...systemJob,
        closedAt: new Date(),
      });

      await expect(service.trackJob("job-1", "user-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("updateTrackedJob", () => {
    it("updates track fields even when the job is closed", async () => {
      mockDb.findById.mockResolvedValue({
        ...baseJob,
        userId: null,
        closedAt: new Date(),
      });

      await service.updateTrackedJob("job-1", { status: "applied" }, "user-1");

      expect(mockDb.update).toHaveBeenCalledWith(
        "tracked_jobs",
        { status: "applied" },
        { id: "track-1", userId: "user-1" },
      );
    });

    it("rejects an interview before the job deadline", async () => {
      mockDb.findById.mockResolvedValue({
        ...baseJob,
        userId: null,
        deadline: new Date("2026-06-01"),
      });

      await expect(
        service.updateTrackedJob(
          "job-1",
          { interviewDate: new Date("2026-05-01") },
          "user-1",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects when the user has no track", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      await expect(
        service.updateTrackedJob("job-1", { status: "applied" }, "user-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("findAll", () => {
    it("flattens tracks and sorts favorites first by default", async () => {
      const otherJob = {
        ...baseJob,
        id: "job-2",
        title: "Designer",
      };
      const favorite = {
        ...baseTrack,
        id: "track-2",
        jobId: "job-2",
        isFavorite: true,
      };

      mockDb.findAllByColumn.mockResolvedValue([
        { ...baseTrack, job: baseJob },
        { ...favorite, job: otherJob },
      ]);

      const result = await service.findAll({
        userId: "user-1",
      });

      expect(result.map((item) => item.id)).toEqual(["job-2", "job-1"]);
      expect(result[0].track?.id).toBe("track-2");
    });

    it("filters by search in memory", async () => {
      const otherJob = {
        ...baseJob,
        id: "job-2",
        title: "Designer",
      };

      mockDb.findAllByColumn.mockResolvedValue([
        { ...baseTrack, job: baseJob },
        { ...baseTrack, id: "track-2", jobId: "job-2", job: otherJob },
      ]);

      const result = await service.findAll({
        userId: "user-1",
        query: { search: "design" },
      });

      expect(result.map((item) => item.id)).toEqual(["job-2"]);
    });

    it("paginates in memory", async () => {
      mockDb.findAllByColumn.mockResolvedValue([
        { ...baseTrack, job: baseJob },
      ]);

      const result = await service.findAll({
        userId: "user-1",
        pagination: { offset: 1, limit: 1 },
      });

      expect(result).toEqual([]);
    });
  });

  describe("discover", () => {
    it("returns nothing in app mode", async () => {
      vi.stubEnv("IS_APP_MODE", "true");

      await expect(service.discover({})).resolves.toEqual([]);
      expect(mockDb.findAllByColumn).not.toHaveBeenCalled();
    });

    it("queries open system jobs and excludes private ones", async () => {
      await service.discover({});

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { state: "ok", userId: null, closedAt: null },
        sortBy: [{ column: "createdAt", order: "desc" }],
        pagination: undefined,
      });
    });

    it("uses search when provided", async () => {
      mockDb.search.mockResolvedValue({ data: [baseJob] });

      const result = await service.discover({ query: { search: "eng" } });

      expect(result).toEqual([baseJob]);
      expect(mockDb.search).toHaveBeenCalledWith(
        "jobs",
        ["title", "description"],
        "eng",
        expect.objectContaining({
          filter: { state: "ok", userId: null, closedAt: null },
        }),
      );
    });

    it("scopes the company feed to that company", async () => {
      await service.discover({
        companyId: 7,
        pagination: { offset: 0, limit: 5 },
      });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { state: "ok", userId: null, closedAt: null, companyId: 7 },
        sortBy: [{ column: "createdAt", order: "desc" }],
        pagination: { offset: 0, limit: 5 },
      });
    });
  });

  describe("findOne", () => {
    it("rejects another user's private job", async () => {
      mockDb.findById.mockResolvedValue({ ...baseJob, userId: "other" });
      mockDb.findAllByColumn.mockResolvedValue([]);

      await expect(service.findOne("job-1", "user-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns topic ids and the caller's track", async () => {
      mockDb.findById.mockResolvedValue({
        ...baseJob,
        userId: null,
        jobTopics: [{ topicId: 7 }],
      });
      mockDb.findAllByColumn.mockResolvedValue([baseTrack]);

      const result = await service.findOne("job-1", "user-1");

      expect(result.topicIds).toEqual([7]);
      expect(result.track?.id).toBe("track-1");
      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("tracked_jobs", {
        filter: { userId: "user-1", jobId: "job-1" },
      });
    });
  });

  describe("update", () => {
    it("rejects system jobs", async () => {
      mockDb.findById.mockResolvedValue({ ...baseJob, userId: null });

      await expect(
        service.update("job-1", { title: "New" }, "user-1"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("updates private job fields and topics", async () => {
      await service.update("job-1", { title: "New" }, "user-1");

      expect(mockDb.update).toHaveBeenCalledWith(
        "jobs",
        { title: "New" },
        { id: "job-1", userId: "user-1" },
        mockTransaction,
      );
    });
  });

  describe("delete", () => {
    const systemJob = { ...baseJob, userId: null } as unknown as TJob;

    it("deletes only the track for a system job", async () => {
      mockDb.findById.mockResolvedValue(systemJob);
      mockDb.findAllByColumn.mockImplementation((table: string) =>
        Promise.resolve(table === "tracked_jobs" ? [baseTrack] : []),
      );

      await service.delete("job-1", "user-1");

      expect(mockDb.delete).toHaveBeenCalledTimes(1);
      expect(mockDb.delete).toHaveBeenCalledWith(
        "tracked_jobs",
        { id: "track-1", userId: "user-1" },
        false,
        mockTransaction,
      );
    });

    it("deletes the track and the private job", async () => {
      mockDb.findById.mockResolvedValue(baseJob);
      mockDb.findAllByColumn.mockImplementation((table: string) =>
        Promise.resolve(table === "tracked_jobs" ? [baseTrack] : []),
      );

      await service.delete("job-1", "user-1");

      expect(mockDb.delete).toHaveBeenCalledWith(
        "tracked_jobs",
        { id: "track-1", userId: "user-1" },
        false,
        mockTransaction,
      );
      expect(mockDb.delete).toHaveBeenCalledWith(
        "jobs",
        { id: "job-1", userId: "user-1" },
        false,
        mockTransaction,
      );
    });

    it("blocks deletion when prep sessions reference the track", async () => {
      mockDb.findById.mockResolvedValue(systemJob);
      mockDb.findAllByColumn.mockImplementation((table: string) =>
        Promise.resolve(
          table === "tracked_jobs" ? [baseTrack] : [{ id: "s-1" }],
        ),
      );

      await expect(service.delete("job-1", "user-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("deletes anyway with force", async () => {
      mockDb.findById.mockResolvedValue(systemJob);
      mockDb.findAllByColumn.mockImplementation((table: string) =>
        Promise.resolve(
          table === "tracked_jobs" ? [baseTrack] : [{ id: "s-1" }],
        ),
      );

      await service.delete("job-1", "user-1", true);

      expect(mockDb.delete).toHaveBeenCalledTimes(1);
      expect(mockDb.delete).toHaveBeenCalledWith(
        "tracked_jobs",
        { id: "track-1", userId: "user-1" },
        false,
        mockTransaction,
      );
    });

    it("404s for an untracked system job", async () => {
      mockDb.findById.mockResolvedValue(systemJob);
      mockDb.findAllByColumn.mockResolvedValue([]);

      await expect(service.delete("job-1", "user-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("extractJob", () => {
    it("normalizes the URL and composes the title without a lookup", async () => {
      mockGenAiService.extractJob.mockResolvedValue({
        companyName: "Acme",
        roleName: "Engineer",
        url: "https://Example.com/job/?utm_source=x#frag",
      });

      const result = await service.extractJob(
        { description: "desc", provider: "google" },
        "user-1",
      );

      expect(result.url).toBe("https://example.com/job");
      expect(result.title).toBe("Acme - Engineer");
      expect(result).not.toHaveProperty("existingJobId");
      expect(mockDb.findAllByColumn).not.toHaveBeenCalled();
    });
  });

  describe("findFromUrl", () => {
    it("normalizes the URL and returns open system jobs", async () => {
      mockDb.findAllByColumn.mockResolvedValue([baseJob]);

      const result = await service.findFromUrl(
        "https://Example.com/job/?utm_source=x#frag",
      );

      expect(result).toEqual([baseJob]);
      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: {
          userId: null,
          url: "https://example.com/job",
          state: "ok",
          closedAt: null,
        },
      });
    });

    it("rejects a non-http URL", async () => {
      await expect(
        service.findFromUrl("javascript:alert(1)"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDb.findAllByColumn).not.toHaveBeenCalled();
    });
  });

  describe("generateCoverLetter", () => {
    const dto = { provider: "google" as const };

    it("includes the user's cover letter template in the prompt", async () => {
      mockDb.findById.mockResolvedValue(baseJob);
      mockDb.findAllByColumn.mockResolvedValue([
        { coverLetterTemplate: "MY COVER TEMPLATE" },
      ]);
      mockGenAiService.generateStructured.mockResolvedValue({
        markdown: "letter",
      });

      const result = await service.generateCoverLetter("job-1", dto, "user-1");

      expect(result).toEqual({ markdown: "letter" });
      const { prompt } = mockGenAiService.generateStructured.mock.calls[0][0];
      expect(prompt).toContain("MY COVER TEMPLATE");
      expect(prompt).toContain("desc");
      expect(prompt).toContain("<company_name>\nAcme\n</company_name>");
      expect(prompt).toContain("RESUME TEXT");
      expect(prompt).toContain("<template_cover_letter>");
      expect(prompt).toContain("Reminder: follow <template_cover_letter>");
    });

    it("forwards a selected resumeId", async () => {
      mockDb.findById.mockResolvedValue(baseJob);
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockGenAiService.generateStructured.mockResolvedValue({
        markdown: "letter",
      });

      await service.generateCoverLetter(
        "job-1",
        { ...dto, resumeId: "resume-9" },
        "user-1",
      );

      expect(mockResumeService.resumeToText).toHaveBeenCalledWith({
        userId: "user-1",
        provider: "google",
        model: undefined,
        resumeId: "resume-9",
      });
    });
  });
});
