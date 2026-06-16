import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import {
  expectedCompanyStructure,
  getCompanyPayload,
} from "./company.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);
const routePath = "/company";

describe("Company (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let adminAuthCookie: string;

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
    if (!isAppMode) {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      authCookie = cookie;

      const { cookie: adminCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
        { role: "admin" },
      );
      adminAuthCookie = adminCookie;
    }
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const create = (
    payload: Record<string, unknown> = getCompanyPayload(),
    userCookie?: string,
  ) => auth(httpServer.post(routePath), userCookie).send(payload).expect(201);

  describe("POST /company", () => {
    it("should create a company", async () => {
      const payload = getCompanyPayload();
      const { body } = await create(payload);

      expect(body.statusCode).toBe(201);
      expect(body.data).toMatchObject({
        name: payload.name,
      });
      expect(body.data.id).toEqual(expect.any(Number));
    });

    it("should return 400 when name is missing", async () =>
      auth(httpServer.post(routePath)).send({}).expect(400));

    it("should return 400 when name is empty", async () =>
      auth(httpServer.post(routePath)).send({ name: "" }).expect(400));

    it("should return 400 when name is whitespace only", async () =>
      auth(httpServer.post(routePath)).send({ name: "   " }).expect(400));

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.post(routePath).send(getCompanyPayload()).expect(401);
    });
  });

  describe("GET /company", () => {
    it("should return empty list when no companies exist", async () => {
      const { body } = await auth(httpServer.get(routePath)).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return all companies", async () => {
      await create();
      await create();

      await auth(httpServer.get(routePath))
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data).toHaveLength(2);
          expect(data[0]).toMatchObject(expectedCompanyStructure());
          expect(data[1]).toMatchObject(expectedCompanyStructure());
        });
    });

    it("should return company with all expected fields", async () => {
      const payload = getCompanyPayload();
      const {
        body: { data: created },
      } = await create(payload);

      const { body } = await auth(httpServer.get(routePath)).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject(created);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get(routePath).expect(401);
    });

    it("should search companies by name", async () => {
      await create({ name: "Google" });
      await create({ name: "Meta" });

      const { body } = await auth(
        httpServer.get(`${routePath}?name=google`),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Google");
    });

    it("should return empty list when search name does not match", async () => {
      await create({ name: "Google" });

      const { body } = await auth(
        httpServer.get(`${routePath}?name=nonexistent`),
      ).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return all companies when no name query is given", async () => {
      await create({ name: "Alpha" });
      await create({ name: "Beta" });

      const { body } = await auth(httpServer.get(routePath)).expect(200);

      expect(body.data).toHaveLength(2);
    });
  });

  describe("PATCH /company/:id", () => {
    it("should update company name", async () => {
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;

      await auth(httpServer.patch(`${routePath}/${id}`), adminAuthCookie)
        .send({ name: "Updated Name" })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.name).toBe("Updated Name");
        });
    });

    it("should return 400 when patching with empty name", async () => {
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;

      await auth(httpServer.patch(`${routePath}/${id}`), adminAuthCookie)
        .send({ name: "" })
        .expect(400);
    });

    it("should return 403 for non-admin user in web mode", async () => {
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;

      await auth(httpServer.patch(`${routePath}/${id}`))
        .send({ name: "Hacked" })
        .expect(isAppMode ? 200 : 403);
    });

    it("should return 404 when patching non-existent entry", async () => {
      await auth(httpServer.patch(`${routePath}/99999`), adminAuthCookie)
        .send({ name: "Nope" })
        .expect(404);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;

      await httpServer
        .patch(`${routePath}/${id}`)
        .send({ name: "Nope" })
        .expect(401);
    });
  });

  describe("DELETE /company/:id", () => {
    it("should delete a company and return 204", async () => {
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;

      await auth(
        httpServer.delete(`${routePath}/${id}`),
        adminAuthCookie,
      ).expect(204);
    });

    it("should remove the company from the list after deletion", async () => {
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;
      await create();
      await create();

      await auth(
        httpServer.delete(`${routePath}/${id}`),
        adminAuthCookie,
      ).expect(204);

      const { body } = await auth(httpServer.get(routePath)).expect(200);
      const ids = (body.data as { id: number }[]).map((r) => r.id);
      expect(ids).not.toContain(id);
    });

    it("should not affect other entries when deleting one", async () => {
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;
      await create();
      await create();

      await auth(
        httpServer.delete(`${routePath}/${id}`),
        adminAuthCookie,
      ).expect(204);

      const { body } = await auth(httpServer.get(routePath)).expect(200);
      expect(body.data).toHaveLength(2);
    });

    it("should return 403 for non-admin user in web mode", async () => {
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;

      await auth(httpServer.delete(`${routePath}/${id}`)).expect(
        isAppMode ? 204 : 403,
      );
    });

    it("should return 404 when deleting non-existent entry", async () => {
      const { body } = await auth(
        httpServer.delete(`${routePath}/99999`),
        adminAuthCookie,
      ).expect(404);

      expect(body.statusCode).toBe(404);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      const {
        body: { data: created },
      } = await create();
      const id: number = created.id;

      await httpServer.delete(`${routePath}/${id}`).expect(401);
    });
  });
});
