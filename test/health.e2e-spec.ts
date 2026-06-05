import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import { getTestAuthHeader } from "./utils/auth-helpers";
import { bootstrapTestServer } from "./utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Health (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;

  beforeAll(async () => {
    const { appInstance, httpServerInstance, dbServiceInstance } =
      await bootstrapTestServer();
    app = appInstance;
    httpServer = httpServerInstance;
    dbService = dbServiceInstance;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbService.dbClear();
  });

  describe("GET /health", () => {
    it("Should return with Unauthorized(401) in web mode and Ok(200) in app mode", () =>
      httpServer.get("/health").expect(isAppMode ? 200 : 401));

    it("should return with OK(200) with authentication header", async () => {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      await httpServer
        .get("/health")
        .set("Cookie", cookie)
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.status).toBe("healthy");
          expect(data.checks.database.status).toBe("up");
        });
    });
  });

  it("GET /health/public → 200 anonymous", async () =>
    httpServer
      .get("/health/public")
      .expect(200)
      .expect(({ body: { data } }) => {
        expect(data.status).toBe("healthy");
      }));
});
