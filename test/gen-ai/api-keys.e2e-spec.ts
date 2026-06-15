import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";
import type { TApiKeyInsert } from "@/src/database/database.types";

import {
  expectedApiKeyStructure,
  getApiKeyPayload,
  platform,
} from "./gen-ai.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Gen-AI API keys (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let apiKeyPayload: TApiKeyInsert;

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
    apiKeyPayload = getApiKeyPayload();
    if (!isAppMode) {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      authCookie = cookie;
    }
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const createApiKey = (
    payload: Record<string, unknown> = getApiKeyPayload(),
    userCookie?: string,
  ) =>
    auth(httpServer.post("/ai/api-keys"), userCookie).send(payload).expect(201);

  describe("POST /ai/api-keys", () => {
    it("should create an api key", async () => {
      const { body } = await createApiKey(apiKeyPayload);

      expect(body.statusCode).toBe(201);
      expect(body.message).toBe("");
      expect(body.data).toMatchObject({
        name: apiKeyPayload.name,
        platform,
        isActive: false,
      });
      expect(body.data.id).toEqual(expect.any(String));
      expect(body.data.key).toBeUndefined();
      if (!isAppMode) expect(body.data.userId).toEqual(expect.any(String));
    });

    it("should create an api key with isActive true", async () => {
      const { body } = await createApiKey({
        ...getApiKeyPayload(),
        isActive: true,
      });

      expect(body.data.isActive).toBe(true);
    });

    it("should return 400 when name is missing", async () => {
      await auth(httpServer.post("/ai/api-keys"))
        .send({ key: "test", platform })
        .expect(400);
    });

    it("should return 400 when name is empty", async () => {
      await auth(httpServer.post("/ai/api-keys"))
        .send({ name: "", key: "test", platform })
        .expect(400);
    });

    it("should return 400 when key is missing", async () => {
      await auth(httpServer.post("/ai/api-keys"))
        .send({ name: "test", platform })
        .expect(400);
    });

    it("should return 400 when platform is missing", async () => {
      await auth(httpServer.post("/ai/api-keys"))
        .send({ name: "test", key: "test" })
        .expect(400);
    });

    it("should return 400 when platform is invalid", async () => {
      await auth(httpServer.post("/ai/api-keys"))
        .send({ name: "test", key: "test", platform: "invalid" })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.post("/ai/api-keys").send(apiKeyPayload).expect(401);
    });
  });

  describe("GET /ai/api-keys", () => {
    it("should return empty list when no api keys exist", async () => {
      const { body } = await auth(httpServer.get("/ai/api-keys")).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return all api keys", async () => {
      await createApiKey();
      await createApiKey();

      await auth(httpServer.get("/ai/api-keys"))
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data).toHaveLength(2);
          expect(data[0]).toMatchObject(expectedApiKeyStructure());
          expect(data[1]).toMatchObject(expectedApiKeyStructure());
        });
    });

    it("should return keys with all expected fields", async () => {
      const { body: created } = await createApiKey();

      const { body } = await auth(httpServer.get("/ai/api-keys")).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject(created.data);
    });

    it("should filter by platform", async () => {
      await createApiKey();

      const { body } = await auth(
        httpServer.get("/ai/api-keys?platform=google"),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].platform).toBe("google");
    });

    it("should return 400 when platform filter is invalid", async () => {
      await createApiKey();
      await auth(httpServer.get("/ai/api-keys?platform=nonexistent")).expect(
        400,
      );
    });

    it("should filter by isActive", async () => {
      await createApiKey({ ...getApiKeyPayload(), isActive: false });
      await createApiKey({ ...getApiKeyPayload(), isActive: true });

      const { body } = await auth(
        httpServer.get("/ai/api-keys?isActive=true"),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].isActive).toBe(true);
    });

    it("should filter by isActive false", async () => {
      await createApiKey({ ...getApiKeyPayload(), isActive: false });
      await createApiKey({ ...getApiKeyPayload(), isActive: true });

      const { body } = await auth(
        httpServer.get("/ai/api-keys?isActive=false"),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].isActive).toBe(false);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get("/ai/api-keys").expect(401);
    });
  });

  describe("DELETE /ai/api-keys/:id", () => {
    it("should delete an api key and return 204", async () => {
      const { body: created } = await createApiKey();
      const keyId: string = created.data.id;

      await auth(httpServer.delete(`/ai/api-keys/${keyId}`)).expect(204);
    });

    it("should remove the key from the list after deletion", async () => {
      const { body: created } = await createApiKey();
      const keyId: string = created.data.id;
      await createApiKey();
      await createApiKey();

      await auth(httpServer.delete(`/ai/api-keys/${keyId}`)).expect(204);

      const { body } = await auth(httpServer.get("/ai/api-keys")).expect(200);
      const ids = (body.data as { id: string }[]).map((k) => k.id);
      expect(ids).not.toContain(keyId);
    });

    it("should not affect other keys when deleting one", async () => {
      const { body: key1 } = await createApiKey();
      const key1Id: string = key1.data.id;
      await createApiKey();
      await createApiKey();

      await auth(httpServer.delete(`/ai/api-keys/${key1Id}`)).expect(204);

      const { body } = await auth(httpServer.get("/ai/api-keys")).expect(200);
      expect(body.data).toHaveLength(2);
    });

    it("should return 404 when deleting non-existent key", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const { body } = await auth(
        httpServer.delete(`/ai/api-keys/${fakeId}`),
      ).expect(404);

      expect(body.statusCode).toBe(404);
    });

    it("should return 404 when deleting another user's key", async () => {
      if (isAppMode) return;

      const { body: created } = await createApiKey();
      const keyId: string = created.data.id;

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      const { body } = await httpServer
        .delete(`/ai/api-keys/${keyId}`)
        .set("Cookie", otherCookie)
        .expect(404);

      expect(body.statusCode).toBe(404);
    });
  });

  describe("PATCH /ai/api-keys/:id/activate", () => {
    it("should activate an api key", async () => {
      const { body: created } = await createApiKey();
      const keyId: string = created.data.id;

      await auth(httpServer.patch(`/ai/api-keys/${keyId}/activate`)).expect(
        200,
      );

      const { body } = await auth(
        httpServer.get("/ai/api-keys?isActive=true"),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(keyId);
    });

    it("should deactivate other keys on the same platform when activating a new one", async () => {
      await createApiKey({
        ...getApiKeyPayload(),
        isActive: true,
      });

      const { body: key2 } = await createApiKey(apiKeyPayload);
      const key2Id: string = key2.data.id;

      await auth(httpServer.patch(`/ai/api-keys/${key2Id}/activate`)).expect(
        200,
      );

      const { body } = await auth(
        httpServer.get("/ai/api-keys?isActive=true"),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(key2Id);
    });

    it("should return 404 when activating non-existent key", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const { body } = await auth(
        httpServer.patch(`/ai/api-keys/${fakeId}/activate`),
      ).expect(404);

      expect(body.statusCode).toBe(404);
    });
  });
});
