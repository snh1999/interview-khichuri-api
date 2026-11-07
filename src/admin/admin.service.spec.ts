import { describe, expect, it, vi } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import { AdminService } from "./admin.service";

describe("AdminService", () => {
  it("returns a zero count when no failed jobs match", async () => {
    const update = vi.fn().mockResolvedValue([]);
    const service = new AdminService(
      { update } as unknown as IDatabaseService,
      undefined as never,
      undefined as never,
    );

    await expect(service.retryFailedJobs()).resolves.toEqual({ count: 0 });
    expect(update).toHaveBeenCalledWith(
      "jobs",
      expect.objectContaining({ state: "none" }),
      { userId: null, state: "failed" },
      undefined,
      true,
    );
  });
});
