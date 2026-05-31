import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

import { TDatabaseCheck, THealthReturn } from "./health.types";
import { IDatabaseService } from "../database/database.types";

@Controller("health")
export class HealthController {
  public constructor(private readonly dbService: IDatabaseService) {}

  @Get()
  public async getHealth(): Promise<THealthReturn> {
    const result = await this.runChecks();

    if (result.status !== "up") {
      throw new ServiceUnavailableException(result);
    }

    return {
      status: "healthy",
      message: "All systems operational",
      timestamp: result.timestamp,
      checks: result.checks,
    };
  }

  @Get("public")
  @AllowAnonymous()
  public async getPublicHealth(): Promise<THealthReturn> {
    return this.getHealth();
  }

  private async runChecks() {
    const timestamp = new Date().toISOString();
    const dbCheck = await this.pingDatabase();

    return {
      timestamp,
      status: dbCheck.status,
      checks: { database: dbCheck },
    };
  }

  private async pingDatabase(): Promise<TDatabaseCheck> {
    const start = Date.now();
    try {
      await this.dbService.dbPing();
      return {
        status: "up" as const,
        responseTimeMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "down" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
