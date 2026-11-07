import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminController } from "../admin.controller";
import { AdminService } from "../admin.service";

describe("AdminController", () => {
  let controller: AdminController;
  const mockAdminService = {
    getStats: vi.fn(),
    findUsers: vi.fn(),
    findUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockAdminService }],
    }).compile();

    controller = module.get(AdminController);
  });

  describe("getStats", () => {
    it("delegates to adminService.getStats", async () => {
      const expected = { users: {}, usage: {}, signups: [] };
      mockAdminService.getStats.mockResolvedValue(expected);

      const result = await controller.getStats();

      expect(mockAdminService.getStats).toHaveBeenCalledWith();
      expect(result).toEqual(expected);
    });
  });

  describe("getUsers", () => {
    it("delegates query, pagination and sort to adminService.findUsers", async () => {
      const expected = { users: [], total: 0 };
      mockAdminService.findUsers.mockResolvedValue(expected);

      const query = { role: "admin" };
      const pagination = { offset: 0, limit: 20 };
      const sort = [{ column: "createdAt", order: "desc" as const }];

      const result = await controller.getUsers(query, pagination, sort);

      expect(mockAdminService.findUsers).toHaveBeenCalledWith(
        query,
        pagination,
        sort,
      );
      expect(result).toEqual(expected);
    });

    it("passes undefined pagination and sort through unchanged", async () => {
      mockAdminService.findUsers.mockResolvedValue({ users: [], total: 0 });

      await controller.getUsers({});

      expect(mockAdminService.findUsers).toHaveBeenCalledWith(
        {},
        undefined,
        undefined,
      );
    });
  });

  describe("getUser", () => {
    it("delegates the id to adminService.findUser", async () => {
      const expected = { user: { id: "u1" } };
      mockAdminService.findUser.mockResolvedValue(expected);

      const result = await controller.getUser("u1");

      expect(mockAdminService.findUser).toHaveBeenCalledWith("u1");
      expect(result).toEqual(expected);
    });
  });
});
