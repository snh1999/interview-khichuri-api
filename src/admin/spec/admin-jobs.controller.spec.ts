import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminJobsController } from "../admin-jobs.controller";
import { AdminService } from "../admin.service";

describe("AdminJobsController", () => {
  let controller: AdminJobsController;
  const mockAdminService = {
    findFailedJobs: vi.fn(),
    retryFailedJob: vi.fn(),
    setJobDescription: vi.fn(),
    getAiStatus: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AdminJobsController],
      providers: [{ provide: AdminService, useValue: mockAdminService }],
    }).compile();

    controller = module.get(AdminJobsController);
  });

  it("lists failed jobs", async () => {
    const jobs = [{ id: "1" }];
    mockAdminService.findFailedJobs.mockResolvedValue(jobs);

    await expect(controller.findFailedJobs()).resolves.toEqual(jobs);
  });

  it("retries a failed job", async () => {
    mockAdminService.retryFailedJob.mockResolvedValue({ id: "1" });

    await controller.retryFailedJob("1");

    expect(mockAdminService.retryFailedJob).toHaveBeenCalledWith("1");
  });

  it("stores a pasted description", async () => {
    const dto = { description: "desc" };
    mockAdminService.setJobDescription.mockResolvedValue({ id: "1" });

    await controller.setJobDescription("1", dto);

    expect(mockAdminService.setJobDescription).toHaveBeenCalledWith("1", dto);
  });

  it("returns AI status", async () => {
    const status = {
      enabled: false,
      pausedUntil: null,
      ownerEmail: null,
      provider: null,
      model: null,
      reason: "no-admin",
    };
    mockAdminService.getAiStatus.mockResolvedValue(status);

    await expect(controller.getAiStatus()).resolves.toEqual(status);
  });
});
