import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";

import type { CreateJobDto, TJobsQuery, UpdateJobDto } from "./jobs.dto";
import { JobsService } from "./jobs.service";
import { IDatabaseService } from "../database/database.service";

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
  const mockGenAiService = {};
  const mockLookupsService = {
    resolveOrCreateNames: vi.fn().mockResolvedValue([]),
    resolveOrCreateName: vi.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: IDatabaseService,
          useValue: mockDb,
        },
        {
          provide: GenAiService,
          useValue: mockGenAiService,
        },
        {
          provide: LookupsService,
          useValue: mockLookupsService,
        },
      ],
    }).compile();

    service = module.get(JobsService);
  });

  describe("create", () => {
    it("should call db.create with mapped fields", async () => {
      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        status: "applied",
        isFavorite: false,
      };
      const job = {
        id: "1",
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        status: "applied",
        userId: "user-1",
      };
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.create.mockResolvedValue(job);

      const result = await service.create(dto, "user-1");

      expect(mockDb.create).toHaveBeenCalledWith(
        "jobs",
        {
          userId: "user-1",
          title: "Engineer",
          companyName: "Acme",
          description: "A great job",
          status: "applied",
          isFavorite: false,
        },
        {},
      );
      expect(result).toEqual(job);
    });

    it("should pass deadline through to db.create when provided", async () => {
      const deadline = new Date("2025-06-15T00:00:00.000Z");
      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        deadline,
        status: "saved",
        isFavorite: false,
      };
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.create.mockResolvedValue({ id: "1" });

      await service.create(dto, "user-1");

      const callArg = mockDb.create.mock.calls[0][1];
      expect(callArg.deadline).toBe(deadline);
    });

    it("should pass interviewDate through to db.create when provided", async () => {
      const interviewDate = new Date("2025-07-01T10:00:00.000Z");
      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        interviewDate,
        status: "saved",
        isFavorite: false,
      };
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.create.mockResolvedValue({ id: "1" });

      await service.create(dto, "user-1");

      const callArg = mockDb.create.mock.calls[0][1];
      expect(callArg.interviewDate).toBe(interviewDate);
    });

    it("should pass roleId when provided", async () => {
      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        roleId: 5,
        status: "saved",
        isFavorite: false,
      };
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.create.mockResolvedValue({ id: "1" });

      await service.create(dto, "user-1");

      expect(mockDb.create).toHaveBeenCalledWith(
        "jobs",
        expect.objectContaining({ roleId: 5 }),
        expect.anything(),
      );
    });

    it("should work without userId (app mode)", async () => {
      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        status: "saved",
        isFavorite: false,
      };
      mockDb.create.mockResolvedValue({ id: "1" });

      await service.create(dto);

      expect(mockDb.create).toHaveBeenCalledWith(
        "jobs",
        expect.objectContaining({ userId: undefined }),
        expect.anything(),
      );
    });

    it("should set default status to saved", async () => {
      const dto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        status: "saved",
      } as CreateJobDto;
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.create.mockResolvedValue({ id: "1" });

      await service.create(dto, "user-1");

      expect(mockDb.create).toHaveBeenCalledWith(
        "jobs",
        expect.objectContaining({ status: "saved" }),
        expect.anything(),
      );
    });

    it("should throw ConflictException when user reaches job limit", async () => {
      mockDb.findAllByColumn.mockResolvedValue(
        Array.from({ length: 200 }, (_, i) => ({ id: String(i) })),
      );

      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        status: "saved",
        isFavorite: false,
      };

      await expect(service.create(dto, "user-1")).rejects.toThrow(
        ConflictException,
      );
      expect(mockDb.create).not.toHaveBeenCalled();
    });

    it("should allow create when user is under job limit", async () => {
      mockDb.findAllByColumn.mockResolvedValue(
        Array.from({ length: 199 }, (_, i) => ({ id: String(i) })),
      );
      mockDb.create.mockResolvedValue({ id: "200" });

      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        status: "saved",
        isFavorite: false,
      };

      await service.create(dto, "user-1");
      expect(mockDb.create).toHaveBeenCalled();
    });

    it("should skip job limit check when no userId", async () => {
      mockDb.create.mockResolvedValue({ id: "1" });

      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "A great job",
        status: "saved",
        isFavorite: false,
      };

      await service.create(dto);
      expect(mockDb.findAllByColumn).not.toHaveBeenCalled();
      expect(mockDb.create).toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    const defaultSort = [
      { column: "isFavorite", order: "desc" },
      { column: "createdAt", order: "desc" },
    ];

    it("should return jobs with default sort", async () => {
      const jobs = [{ id: "1", title: "Engineer" }];
      mockDb.findAllByColumn.mockResolvedValue(jobs);

      const query: TJobsQuery = { dateFilter: [] };
      const result = await service.findAll({
        userId: "user-1",
        query,
        pagination: { offset: 0, limit: 20 },
      });

      expect(result).toEqual(jobs);
      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { userId: "user-1" },
        sortBy: defaultSort,
        pagination: { offset: 0, limit: 20 },
      });
    });

    it("should pass status filter to db", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      const query: TJobsQuery = {
        status: "applied",
        dateFilter: [],
      };
      await service.findAll({ userId: "user-1", query });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { userId: "user-1", status: "applied" },
        sortBy: defaultSort,
        pagination: undefined,
      });
    });

    it("should use search via db.search", async () => {
      const searchResult = { data: [{ id: "1", title: "Engineer" }], total: 1 };
      mockDb.search.mockResolvedValue(searchResult);

      const query: TJobsQuery = {
        search: "engineer",
        dateFilter: [],
      };
      const result = await service.findAll({ userId: "user-1", query });

      expect(mockDb.search).toHaveBeenCalledWith(
        "jobs",
        ["title", "description"],
        "engineer",
        {
          filter: { userId: "user-1" },
          pagination: undefined,
        },
      );
      expect(result).toHaveLength(1);
    });

    it("should map date filters to dateRanges", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      const query: TJobsQuery = {
        dateFilter: [
          {
            type: "deadline",
            from: new Date("2026-01-01"),
            to: new Date("2026-12-31"),
          },
        ],
      };
      await service.findAll({ userId: "user-1", query });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { userId: "user-1" },
        sortBy: defaultSort,
        pagination: undefined,
        dateRanges: [
          {
            column: "deadline",
            range: {
              from: new Date("2026-01-01"),
              to: new Date("2026-12-31"),
            },
          },
        ],
      });
    });

    it("should map interview date filter correctly", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      const query: TJobsQuery = {
        dateFilter: [{ type: "interview", from: new Date("2026-06-01") }],
      };
      await service.findAll({ userId: "user-1", query });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith(
        "jobs",
        expect.objectContaining({
          dateRanges: [
            {
              column: "interviewDate",
              range: { from: new Date("2026-06-01"), to: undefined },
            },
          ],
        }),
      );
    });

    it("should map applied date filter correctly", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      const query: TJobsQuery = {
        dateFilter: [{ type: "applied", to: new Date("2026-06-30") }],
      };
      await service.findAll({ userId: "user-1", query });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith(
        "jobs",
        expect.objectContaining({
          dateRanges: [
            {
              column: "appliedAt",
              range: { from: undefined, to: new Date("2026-06-30") },
            },
          ],
        }),
      );
    });

    it("should use provided sort and append createdAt", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      const query: TJobsQuery = { dateFilter: [] };
      const sort: TSortEntry[] = [{ column: "title", order: "desc" }];
      await service.findAll({ userId: "user-1", query, sort });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { userId: "user-1" },
        sortBy: [
          { column: "title", order: "desc" },
          { column: "createdAt", order: "desc" },
        ],
        pagination: undefined,
      });
    });

    it("should work without userId", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      const query: TJobsQuery = { dateFilter: [] };
      await service.findAll({ query });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: {},
        sortBy: defaultSort,
        pagination: undefined,
      });
    });
  });

  describe("findAll without options", () => {
    it("should call db.findAllByColumn with userId filter", async () => {
      const jobs = [{ id: "1", title: "Engineer" }];
      mockDb.findAllByColumn.mockResolvedValue(jobs);

      const result = await service.findAll({ userId: "user-1" });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: { userId: "user-1" },
        pagination: undefined,
        sortBy: [
          { column: "isFavorite", order: "desc" },
          { column: "createdAt", order: "desc" },
        ],
      });
      expect(result).toEqual(jobs);
    });

    it("should call db.findAllByColumn without filter when no userId", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      await service.findAll({});

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("jobs", {
        filter: {},
        pagination: undefined,
        sortBy: [
          { column: "isFavorite", order: "desc" },
          { column: "createdAt", order: "desc" },
        ],
      });
    });
  });

  describe("findOne", () => {
    it("should call db.findById with id and userId filter", async () => {
      const job = { id: "1", title: "Engineer", jobTopics: [] };
      mockDb.findById.mockResolvedValue(job);

      const result = await service.findOne("1", "user-1");

      expect(mockDb.findById).toHaveBeenCalledWith("jobs", "1", {
        filter: { userId: "user-1" },
        relation: { jobTopics: true },
      });
      expect(result).toEqual({
        id: "1",
        title: "Engineer",
        jobTopics: [],
        topicIds: [],
      });
    });

    it("should call db.findById with only id when no userId", async () => {
      mockDb.findById.mockResolvedValue({ id: "1", jobTopics: [] });

      const result = await service.findOne("1");

      expect(mockDb.findById).toHaveBeenCalledWith("jobs", "1", {
        filter: {},
        relation: { jobTopics: true },
      });
      expect(result).toEqual({ id: "1", jobTopics: [], topicIds: [] });
    });

    it("should map jobTopics to topicIds", async () => {
      const job = {
        id: "1",
        title: "Engineer",
        jobTopics: [
          { topicId: 5, topic: { id: 5, name: "React" } },
          { topicId: 8, topic: { id: 8, name: "TypeScript" } },
        ],
      };
      mockDb.findById.mockResolvedValue(job);

      const result = await service.findOne("1");

      expect(result).toEqual({
        id: "1",
        title: "Engineer",
        jobTopics: [
          { topicId: 5, topic: { id: 5, name: "React" } },
          { topicId: 8, topic: { id: 8, name: "TypeScript" } },
        ],
        topicIds: [5, 8],
      });
    });

    it("should call db.findById without relation when populate is false", async () => {
      mockDb.findById.mockResolvedValue({ id: "1" });

      await service.findOne("1", undefined, false);

      expect(mockDb.findById).toHaveBeenCalledWith("jobs", "1", {
        filter: {},
        relation: undefined,
      });
    });
  });

  describe("update", () => {
    it("should call db.update with id, dto, and userId filter", async () => {
      const dto: UpdateJobDto = { title: "Senior Engineer" };
      const updated = { id: "1", title: "Senior Engineer", jobTopics: [] };
      mockDb.update.mockResolvedValue(updated);
      mockDb.findById.mockResolvedValue(updated);

      const result = await service.update("1", dto, "user-1");

      expect(mockDb.update).toHaveBeenCalledWith(
        "jobs",
        { title: "Senior Engineer" },
        { id: "1", userId: "user-1" },
        expect.anything(),
      );
      expect(result).toEqual({
        id: "1",
        title: "Senior Engineer",
        jobTopics: [],
        topicIds: [],
      });
    });

    it("should update companyName when provided", async () => {
      const dto: UpdateJobDto = { companyName: "Acme" };
      mockDb.update.mockResolvedValue([{ id: "1" }]);
      mockDb.findById.mockResolvedValue({
        id: "1",
        companyName: "Acme",
        jobTopics: [],
      });

      await service.update("1", dto, "user-1");

      expect(mockDb.update).toHaveBeenCalledWith(
        "jobs",
        { companyName: "Acme" },
        { id: "1", userId: "user-1" },
        expect.anything(),
      );
    });

    it("should call db.update without userId filter when no userId", async () => {
      const dto: UpdateJobDto = { title: "Senior Engineer" };
      const updated = { id: "1", title: "Senior Engineer", jobTopics: [] };
      mockDb.update.mockResolvedValue(updated);
      mockDb.findById.mockResolvedValue(updated);

      await service.update("1", dto);

      expect(mockDb.update).toHaveBeenCalledWith(
        "jobs",
        { title: "Senior Engineer" },
        { id: "1" },
        expect.anything(),
      );
    });
  });

  describe("delete", () => {
    it("should call db.delete with id and userId filter", async () => {
      mockDb.delete.mockResolvedValue(undefined);

      await service.delete("1", "user-1");

      expect(mockDb.delete).toHaveBeenCalledWith("jobs", {
        id: "1",
        userId: "user-1",
      });
    });

    it("should call db.delete without userId filter when no userId", async () => {
      mockDb.delete.mockResolvedValue(undefined);

      await service.delete("1", undefined);

      expect(mockDb.delete).toHaveBeenCalledWith("jobs", { id: "1" });
    });
  });
});
