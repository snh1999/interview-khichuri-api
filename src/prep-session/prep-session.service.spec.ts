import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDatabaseService } from "@/src/database/database.service";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";

import { PrepSessionService } from "./prep-session.service";

describe("PrepSessionService", () => {
  let service: PrepSessionService;
  const mockTransaction: object = {};
  const mockDb = {
    create: vi.fn(),
    createMany: vi.fn(),
    findAllByColumn: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    syncJunctionTable: vi.fn(),
    withTransaction: vi.fn((cb: (transaction: object) => unknown) =>
      cb(mockTransaction),
    ),
  };
  const mockGenAiService = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PrepSessionService,
        { provide: IDatabaseService, useValue: mockDb },
        { provide: GenAiService, useValue: mockGenAiService },
      ],
    }).compile();

    service = module.get(PrepSessionService);
  });

  describe("create", () => {
    it("rejects a session linking a job the caller does not track", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      await expect(
        service.create(
          { title: "x", jobId: "job-1", isFavorite: false },
          "user-b",
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("tracked_jobs", {
        filter: { userId: "user-b", jobId: "job-1" },
      });
      expect(mockDb.create).not.toHaveBeenCalled();
    });

    it("creates a session when the caller tracks the job", async () => {
      mockDb.findAllByColumn.mockResolvedValue([
        { id: "track-1", userId: "user-a", jobId: "job-1" },
      ]);
      mockDb.create.mockResolvedValue({ id: "session-1", userId: "user-a" });

      await service.create(
        { title: "x", jobId: "job-1", isFavorite: false },
        "user-a",
      );

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("tracked_jobs", {
        filter: { userId: "user-a", jobId: "job-1" },
      });
      expect(mockDb.create).toHaveBeenCalledWith(
        "prep_session",
        expect.objectContaining({
          jobId: "job-1",
          userId: "user-a",
        }),
        mockTransaction,
      );
    });
  });

  describe("update", () => {
    it("rejects topic-only updates to another user's session", async () => {
      mockDb.findById.mockRejectedValue(
        new NotFoundException("prep_session session-1 not found"),
      );

      await expect(
        service.update("session-1", { topicIds: [1, 2] }, "user-b"),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.syncJunctionTable).not.toHaveBeenCalled();
    });

    it("syncs topics when the caller owns the session", async () => {
      mockDb.findById.mockResolvedValue({
        id: "session-1",
        userId: "user-a",
        sessionTopics: [],
        questions: [],
      });

      await service.update("session-1", { topicIds: [1, 2] }, "user-a");

      expect(mockDb.findById).toHaveBeenCalledWith(
        "prep_session",
        "session-1",
        expect.objectContaining({ filter: { userId: "user-a" } }),
      );
      expect(mockDb.syncJunctionTable).toHaveBeenCalledWith(
        "session_topics",
        { column: "sessionId", value: "session-1" },
        "topicId",
        [1, 2],
        mockTransaction,
      );
    });
  });
});
