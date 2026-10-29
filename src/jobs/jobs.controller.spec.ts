import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";

import { JobsController } from "./jobs.controller";
import type { CreateJobDto, TJobsQuery, UpdateJobDto } from "./jobs.dto";
import { JobsService } from "./jobs.service";

describe("JobsController", () => {
  let controller: JobsController;
  const mockJobsService = {
    create: vi.fn(),
    extractJob: vi.fn(),
    findAll: vi.fn(),
    discover: vi.fn(),
    findOne: vi.fn(),
    trackJob: vi.fn(),
    updateTrackedJob: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findFromUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
      ],
    }).compile();

    controller = module.get(JobsController);
  });

  describe("create", () => {
    it("should delegate to jobsService.create with dto and userId", async () => {
      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "desc",
        status: "saved",
        isFavorite: false,
      };
      const expected = {
        id: "1",
        title: "Engineer",
        companyName: "Acme",
        description: "desc",
        status: "saved",
        isFavorite: false,
      };
      mockJobsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, "user-1");

      expect(mockJobsService.create).toHaveBeenCalledWith(dto, "user-1");
      expect(result).toEqual(expected);
    });

    it("should delegate with undefined userId when not provided", async () => {
      const dto: CreateJobDto = {
        title: "Engineer",
        companyName: "Acme",
        description: "desc",
        status: "saved",
        isFavorite: false,
      };
      mockJobsService.create.mockResolvedValue({ id: "1" });

      await controller.create(dto);

      expect(mockJobsService.create).toHaveBeenCalledWith(dto, undefined);
    });
  });

  describe("findAll", () => {
    it("should delegate to jobsService.findAll with query, pagination, and userId", async () => {
      const result = [{ id: "1" }];
      mockJobsService.findAll.mockResolvedValue(result);

      const query: TJobsQuery = {
        search: "eng",
      };
      const pagination = { offset: 0, limit: 20 };

      const response = await controller.findAll(
        pagination,
        undefined,
        query,
        "user-1",
      );

      expect(mockJobsService.findAll).toHaveBeenCalledWith({
        userId: "user-1",
        query,
        pagination,
        sort: undefined,
      });
      expect(response).toEqual(result);
    });

    it("should delegate with undefined userId when not provided", async () => {
      mockJobsService.findAll.mockResolvedValue([]);

      const query: TJobsQuery = {};
      const pagination = { offset: 0, limit: 20 };

      await controller.findAll(pagination, undefined, query);

      expect(mockJobsService.findAll).toHaveBeenCalledWith({
        userId: undefined,
        query,
        pagination,
        sort: undefined,
      });
    });

    it("should pass full query object and sort", async () => {
      mockJobsService.findAll.mockResolvedValue([]);

      const query: TJobsQuery = {
        search: "test",
      };
      const sort: TSortEntry[] = [{ column: "title", order: "desc" }];
      const pagination = { offset: 0, limit: 20 };

      await controller.findAll(pagination, sort, query, "user-1");

      expect(mockJobsService.findAll).toHaveBeenCalledWith({
        userId: "user-1",
        query,
        pagination,
        sort,
      });
    });
  });

  describe("extractJob", () => {
    it("should delegate to jobsService.extractJob with dto and userId", async () => {
      const dto = { description: "desc", provider: "google" as const };
      const extracted = { title: "Acme - Engineer" };
      mockJobsService.extractJob.mockResolvedValue(extracted);

      const result = await controller.extractJob(dto, "user-1");

      expect(mockJobsService.extractJob).toHaveBeenCalledWith(dto, "user-1");
      expect(result).toEqual(extracted);
    });
  });

  describe("discover", () => {
    it("should delegate to jobsService.discover with query, pagination and sort", async () => {
      mockJobsService.discover.mockResolvedValue([]);

      const query: TJobsQuery = {};
      const pagination = { offset: 0, limit: 20 };
      const sort: TSortEntry[] = [{ column: "createdAt", order: "desc" }];

      await controller.discover(pagination, sort, query);

      expect(mockJobsService.discover).toHaveBeenCalledWith({
        query,
        pagination,
        sort,
      });
    });
  });

  describe("trackJob", () => {
    it("should delegate to jobsService.trackJob with id and userId", async () => {
      const tracked = { id: "1" };
      mockJobsService.trackJob.mockResolvedValue(tracked);

      const result = await controller.trackJob("1", "user-1");

      expect(mockJobsService.trackJob).toHaveBeenCalledWith("1", "user-1");
      expect(result).toEqual(tracked);
    });
  });

  describe("updateTrackedJob", () => {
    it("should delegate to jobsService.updateTrackedJob with id, dto and userId", async () => {
      const dto = { status: "applied" as const };
      mockJobsService.updateTrackedJob.mockResolvedValue({ id: "1" });

      await controller.updateTrackedJob("1", dto, "user-1");

      expect(mockJobsService.updateTrackedJob).toHaveBeenCalledWith(
        "1",
        dto,
        "user-1",
      );
    });
  });

  describe("findFromUrl", () => {
    it("should delegate to jobsService.findFromUrl with the query url", async () => {
      const jobs = [{ id: "1" }];
      mockJobsService.findFromUrl.mockResolvedValue(jobs);

      const result = await controller.findFromUrl({
        url: "https://example.com/job",
      });

      expect(mockJobsService.findFromUrl).toHaveBeenCalledWith(
        "https://example.com/job",
      );
      expect(result).toEqual(jobs);
    });
  });

  describe("findOne", () => {
    it("should delegate to jobsService.findOne with id and userId", async () => {
      const job = { id: "1", title: "Engineer" };
      mockJobsService.findOne.mockResolvedValue(job);

      const result = await controller.findOne("1", "user-1");

      expect(mockJobsService.findOne).toHaveBeenCalledWith("1", "user-1");
      expect(result).toEqual(job);
    });
  });

  describe("update", () => {
    it("should delegate to jobsService.update with id, dto, and userId", async () => {
      const dto: UpdateJobDto = { title: "Senior Engineer" };
      const updated = { id: "1", title: "Senior Engineer" };
      mockJobsService.update.mockResolvedValue(updated);

      const result = await controller.update("1", dto, "user-1");

      expect(mockJobsService.update).toHaveBeenCalledWith("1", dto, "user-1");
      expect(result).toEqual(updated);
    });
  });

  describe("remove", () => {
    it("should pass force only for truthy query values", async () => {
      mockJobsService.delete.mockResolvedValue(undefined);

      await controller.remove("1", "true", "user-1");
      expect(mockJobsService.delete).toHaveBeenCalledWith("1", "user-1", true);

      await controller.remove("1", undefined, "user-1");
      expect(mockJobsService.delete).toHaveBeenLastCalledWith(
        "1",
        "user-1",
        false,
      );
    });
  });
});
