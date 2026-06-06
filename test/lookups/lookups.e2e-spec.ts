import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import { expectedRoleStructure, getRolePayload } from "./lookups.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Lookups (e2e)", () => {
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

  const createRole = (
    payload: Record<string, unknown> = getRolePayload(),
    userCookie?: string,
  ) =>
    auth(httpServer.post("/lookups/role"), userCookie)
      .send(payload)
      .expect(201);

  describe("POST /lookups/role", () => {
    it("should create a role", async () => {
      const payload = getRolePayload();
      const { body } = await createRole(payload);

      expect(body.statusCode).toBe(201);
      expect(body.message).toBe("");
      expect(body.data).toMatchObject({
        name: payload.name,
      });
      expect(body.data.id).toEqual(expect.any(Number));
      expect(body.data.isApproved).toBeNull();
    });

    it("should return 400 when name is missing", async () =>
      auth(httpServer.post("/lookups/role")).send({}).expect(400));

    it("should return 400 when name is empty", async () =>
      auth(httpServer.post("/lookups/role")).send({ name: "" }).expect(400));

    it("should return 400 when name is too short", async () =>
      auth(httpServer.post("/lookups/role")).send({ name: "a" }).expect(400));

    it("should return 400 when name is whitespace only", async () =>
      auth(httpServer.post("/lookups/role")).send({ name: "   " }).expect(400));

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.post("/lookups/role").send(getRolePayload()).expect(401);
    });
  });

  describe("GET /lookups/role", () => {
    it("should return empty list when no roles exist", async () => {
      const { body } = await auth(httpServer.get("/lookups/role")).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return all roles", async () => {
      await createRole();
      await createRole();

      await auth(httpServer.get("/lookups/role"))
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data).toHaveLength(2);
          expect(data[0]).toMatchObject(expectedRoleStructure());
          expect(data[1]).toMatchObject(expectedRoleStructure());
        });
    });

    it("should return roles with all expected fields", async () => {
      const payload = getRolePayload();
      const {
        body: { data: created },
      } = await createRole(payload);

      const { body } = await auth(httpServer.get("/lookups/role")).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        ...created,
      });
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get("/lookups/role").expect(401);
    });
  });

  describe("PATCH /lookups/role/:id", () => {
    it("should update role name", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      const newName = "Updated Role Name";

      await auth(httpServer.patch(`/lookups/role/${roleId}`), adminAuthCookie)
        .send({ name: newName })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.name).toBe(newName);
        });
    });

    it("should update isApproved", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      await auth(httpServer.patch(`/lookups/role/${roleId}`), adminAuthCookie)
        .send({ isApproved: true })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.isApproved).toBe(true);
        });
    });

    it("should return 400 when patching with empty name", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      await auth(httpServer.patch(`/lookups/role/${roleId}`), adminAuthCookie)
        .send({ name: "" })
        .expect(400);
    });

    it("should return 403 for non-admin user in web mode", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      await auth(httpServer.patch(`/lookups/role/${roleId}`))
        .send({ name: "Hacked" })
        .expect(isAppMode ? 200 : 403);
    });

    it("should return 404 when patching non-existent role", async () => {
      await auth(httpServer.patch("/lookups/role/99999"), adminAuthCookie)
        .send({ name: "Nope" })
        .expect(404);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      await httpServer
        .patch(`/lookups/role/${roleId}`)
        .send({ name: "Nope" })
        .expect(401);
    });
  });

  describe("DELETE /lookups/role/:id", () => {
    it("should delete a role and return 204", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      await auth(
        httpServer.delete(`/lookups/role/${roleId}`),
        adminAuthCookie,
      ).expect(204);
    });

    it("should remove the role from the list after deletion", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;
      await createRole();
      await createRole();

      await auth(
        httpServer.delete(`/lookups/role/${roleId}`),
        adminAuthCookie,
      ).expect(204);

      const { body } = await auth(httpServer.get("/lookups/role")).expect(200);
      const ids = (body.data as { id: number }[]).map((r) => r.id);
      expect(ids).not.toContain(roleId);
    });

    it("should not affect other roles when deleting one", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;
      await createRole();
      await createRole();

      await auth(
        httpServer.delete(`/lookups/role/${roleId}`),
        adminAuthCookie,
      ).expect(204);

      const { body } = await auth(httpServer.get("/lookups/role")).expect(200);
      expect(body.data).toHaveLength(2);
    });

    it("should return 403 for non-admin user in web mode", async () => {
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      await auth(httpServer.delete(`/lookups/role/${roleId}`)).expect(
        isAppMode ? 204 : 403,
      );
    });

    it("should return 404 when deleting non-existent role", async () => {
      const { body } = await auth(
        httpServer.delete("/lookups/role/99999"),
        adminAuthCookie,
      ).expect(404);

      expect(body.statusCode).toBe(404);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      const {
        body: { data: created },
      } = await createRole();
      const roleId: number = created.id;

      await httpServer.delete(`/lookups/role/${roleId}`).expect(401);
    });
  });
});
