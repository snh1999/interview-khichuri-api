import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDatabaseService } from "../../database/database.service";
import { HealthController } from "../health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const dbPing = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: IDatabaseService, useValue: { dbPing } }],
    }).compile();
    controller = mod.get(HealthController);
  });

  it("returns healthy when DB is up", async () => {
    dbPing.mockResolvedValue(null);
    const result = await controller.getHealth();
    expect(result.status).toBe("healthy");
    expect(result.checks.database.status).toBe("up");
  });

  it("throws 503 when DB is down", async () => {
    dbPing.mockRejectedValue(new Error("ECONNREFUSED"));
    return expect(controller.getHealth()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
