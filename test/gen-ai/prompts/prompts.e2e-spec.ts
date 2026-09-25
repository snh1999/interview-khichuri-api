import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";
import type {
  TPrompt,
  TUserDefaultWithPrompt,
} from "@/src/database/database.types";

import { getPromptPayload } from "./prompts.test-data";
import { getTestAuthHeader } from "../../utils/auth-helpers";
import { bootstrapTestServer } from "../../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);
const routePath = "/prompts";

describe("Prompts (e2e)", () => {
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
    payload: Record<string, unknown> = getPromptPayload(),
    userCookie?: string,
  ) => auth(httpServer.post(routePath), userCookie).send(payload).expect(201);

  describe("POST /prompts", () => {
    it("should create a prompt", async () => {
      const payload = getPromptPayload();
      const { body } = await create(payload);

      expect(body.statusCode).toBe(201);
      expect(body.data).toMatchObject({
        title: payload.title,
        prompt: payload.prompt,
        type: payload.type,
        isPublic: payload.isPublic,
        likeCount: 0,
      });
      expect(body.data.id).toEqual(expect.any(Number));
    });

    it("should return 400 when title is empty", async () =>
      auth(httpServer.post(routePath))
        .send({ title: "", prompt: "test", type: "resume" })
        .expect(400));

    it("should return 400 when prompt is empty", async () =>
      auth(httpServer.post(routePath))
        .send({ title: "test", prompt: "", type: "resume" })
        .expect(400));

    it("should return 400 when type is invalid", async () =>
      auth(httpServer.post(routePath))
        .send({ title: "test", prompt: "test", type: "invalid_type" })
        .expect(400));

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.post(routePath).send(getPromptPayload()).expect(401);
    });
  });

  describe("GET /prompts/public", () => {
    it("should return empty list when no prompts exist", async () => {
      const { body } = await auth(
        httpServer.get(`${routePath}?scope=public`),
      ).expect(200);
      expect(body.data).toEqual([]);
    });

    it("should return only public prompts", async () => {
      await create({ ...getPromptPayload(), isPublic: true });
      await create({ ...getPromptPayload(), isPublic: false });

      const { body } = await auth(
        httpServer.get(`${routePath}?scope=public`),
      ).expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].isPublic).toBe(true);
    });

    it("should filter public prompts by type", async () => {
      await create({ ...getPromptPayload(), type: "resume", isPublic: true });
      await create({
        ...getPromptPayload(),
        type: "behavioral",
        isPublic: true,
      });

      const { body } = await auth(
        httpServer.get(`${routePath}?scope=public&type=resume`),
      ).expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].type).toBe("resume");
    });
  });

  describe("GET /prompts/my", () => {
    it("should return only the user's prompts", async () => {
      await create(getPromptPayload());
      await create(getPromptPayload());

      const { body } = await auth(
        httpServer.get(`${routePath}?scope=my`),
      ).expect(200);
      expect(body.data).toHaveLength(2);
      for (const prompt of body.data as TPrompt[]) {
        expect(prompt.isPublic).toBeDefined();
      }
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get(`${routePath}?scope=my`).expect(401);
    });
  });

  describe("GET /prompts/likes", () => {
    it("should return empty list when user hasn't liked any prompts", async () => {
      const { body } = await auth(httpServer.get(`${routePath}/likes`)).expect(
        200,
      );
      expect(body.data).toEqual([]);
    });

    it("should return liked prompts after user likes them", async () => {
      const {
        body: { data: created },
      } = await create({ ...getPromptPayload(), isPublic: true });

      await auth(httpServer.post(`${routePath}/${created.id}/like`)).expect(
        isAppMode ? 400 : 201,
      );

      if (isAppMode) return;

      const { body } = await auth(httpServer.get(`${routePath}/likes`)).expect(
        200,
      );
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(created.id);
    });

    it("should filter liked prompts by type", async () => {
      if (isAppMode) return;

      const {
        body: { data: resumePrompt },
      } = await create({
        ...getPromptPayload(),
        type: "resume",
        isPublic: true,
      });
      const {
        body: { data: behavioralPrompt },
      } = await create({
        ...getPromptPayload(),
        type: "behavioral",
        isPublic: true,
      });

      await auth(
        httpServer.post(`${routePath}/${resumePrompt.id}/like`),
      ).expect(201);
      await auth(
        httpServer.post(`${routePath}/${behavioralPrompt.id}/like`),
      ).expect(201);

      const { body } = await auth(
        httpServer.get(`${routePath}/likes?type=resume`),
      ).expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(resumePrompt.id);
    });
  });

  describe("POST /prompts/:id/like", () => {
    it("should toggle like on a prompt", async () => {
      if (isAppMode) return;

      const {
        body: { data: created },
      } = await create({ ...getPromptPayload(), isPublic: true });

      const { body: likeBody } = await auth(
        httpServer.post(`${routePath}/${created.id}/like`),
      ).expect(201);
      expect(likeBody.data).toMatchObject({ likeCount: 1 });

      const { body: unlikeBody } = await auth(
        httpServer.post(`${routePath}/${created.id}/like`),
      ).expect(201);
      expect(unlikeBody.data).toMatchObject({ likeCount: 0 });
    });

    it("should persist likeCount on the prompt after toggling", async () => {
      if (isAppMode) return;

      const {
        body: { data: created },
      } = await create({
        ...getPromptPayload(),
        isPublic: true,
      });

      await auth(httpServer.post(`${routePath}/${created.id}/like`)).expect(
        201,
      );

      const { body: afterLike } = await auth(
        httpServer.get(`${routePath}/${created.id}`),
      ).expect(200);
      expect(afterLike.data.likeCount).toBe(1);

      await auth(httpServer.post(`${routePath}/${created.id}/like`)).expect(
        201,
      );

      const { body: afterUnlike } = await auth(
        httpServer.get(`${routePath}/${created.id}`),
      ).expect(200);
      expect(afterUnlike.data.likeCount).toBe(0);
    });

    it("should toggle like on a private prompt", async () => {
      if (isAppMode) return;

      const {
        body: { data: created },
      } = await create({
        ...getPromptPayload(),
        isPublic: false,
      });

      const { body: likeBody } = await auth(
        httpServer.post(`${routePath}/${created.id}/like`),
      ).expect(201);
      expect(likeBody.data).toMatchObject({ likeCount: 1 });

      const { body: unlikeBody } = await auth(
        httpServer.post(`${routePath}/${created.id}/like`),
      ).expect(201);
      expect(unlikeBody.data).toMatchObject({ likeCount: 0 });
    });
  });

  describe("prompt limit", () => {
    it("should return 409 when exceeding max prompts", async () => {
      if (isAppMode) return;

      const payload = getPromptPayload();
      for (let i = 0; i < 50; i++) {
        await create({ ...payload, prompt: `${payload.prompt}-${i}` });
      }
      await auth(httpServer.post(routePath))
        .send(getPromptPayload())
        .expect(409);
    });
  });

  describe("GET /prompts/:id", () => {
    it("should return a prompt by id", async () => {
      const {
        body: { data: created },
      } = await create();

      const { body } = await auth(
        httpServer.get(`${routePath}/${created.id}`),
      ).expect(200);

      expect(body.data.id).toBe(created.id);
      expect(body.data.prompt).toBe(created.prompt);
    });

    it("should return 404 when prompt does not exist", async () => {
      const { body } = await auth(httpServer.get(`${routePath}/0`)).expect(404);
      expect(body.statusCode).toBe(404);
    });
  });

  describe("PATCH /prompts/:id", () => {
    it("should update own prompt", async () => {
      const {
        body: { data: created },
      } = await create();

      const { body } = await auth(
        httpServer.patch(`${routePath}/${created.id}`),
      )
        .send({ prompt: "Updated prompt text here" })
        .expect(200);

      expect(body.data.prompt).toBe("Updated prompt text here");
    });

    it("should return 403 when updating another user's prompt", async () => {
      const {
        body: { data: created },
      } = await create();

      if (!isAppMode) {
        await auth(httpServer.patch(`${routePath}/${created.id}`))
          .set("Cookie", adminAuthCookie)
          .send({ prompt: "Attempted hacked update text" })
          .expect(403);
      }
    });

    it("should return 404 when updating non-existent prompt", async () => {
      await auth(httpServer.patch(`${routePath}/0`))
        .send({ prompt: "This prompt does not exist at all" })
        .expect(404);
    });
  });

  describe("DELETE /prompts/:id", () => {
    it("should delete own prompt", async () => {
      const {
        body: { data: created },
      } = await create();
      await auth(httpServer.delete(`${routePath}/${created.id}`)).expect(204);
    });

    it("should return 403 when deleting another user's prompt", async () => {
      const {
        body: { data: created },
      } = await create();

      if (!isAppMode) {
        await auth(httpServer.delete(`${routePath}/${created.id}`))
          .set("Cookie", adminAuthCookie)
          .expect(403);
      }
    });
  });

  describe("DELETE /prompts/admin/:id", () => {
    it("should allow admin to delete any prompt", async () => {
      const {
        body: { data: created },
      } = await create();

      await auth(
        httpServer.delete(`${routePath}/admin/${created.id}`),
        adminAuthCookie,
      ).expect(204);
    });

    it("should return 403 for non-admin user", async () => {
      const {
        body: { data: created },
      } = await create();

      await auth(httpServer.delete(`${routePath}/admin/${created.id}`)).expect(
        isAppMode ? 204 : 403,
      );
    });

    it("should return 404 when deleting non-existent prompt", async () => {
      await auth(
        httpServer.delete(`${routePath}/admin/0`),
        adminAuthCookie,
      ).expect(404);
    });
  });

  describe("GET /prompts/defaults", () => {
    it("should return empty list when no defaults set", async () => {
      const { body } = await auth(
        httpServer.get(`${routePath}/defaults`),
      ).expect(200);
      expect(body.data).toEqual([]);
    });

    it("should return user defaults with prompt relation after setting them", async () => {
      if (isAppMode) return;

      const {
        body: { data: prompt1 },
      } = await create({
        title: "Resume Default",
        prompt: "Resume default prompt text here",
        type: "resume",
        isPublic: false,
      });
      const {
        body: { data: prompt2 },
      } = await create({
        title: "Behavioral Default",
        prompt: "Behavioral default prompt text",
        type: "behavioral",
        isPublic: false,
      });

      await auth(httpServer.put(`${routePath}/defaults`))
        .send({ type: "resume", promptId: prompt1.id })
        .expect(200);
      await auth(httpServer.put(`${routePath}/defaults`))
        .send({ type: "behavioral", promptId: prompt2.id })
        .expect(200);

      const { body } = await auth(
        httpServer.get(`${routePath}/defaults`),
      ).expect(200);
      expect(body.data).toHaveLength(2);

      const responseData = body.data as TUserDefaultWithPrompt[];

      const resumeDefault = responseData.find(
        (d: { type: string }) => d.type === "resume",
      );
      expect(resumeDefault).toBeDefined();
      expect(resumeDefault?.prompt?.id).toBe(prompt1.id);
      expect(resumeDefault?.prompt?.prompt).toBe(
        "Resume default prompt text here",
      );

      const behavioralDefault = responseData.find(
        (d: { type: string }) => d.type === "behavioral",
      );
      expect(behavioralDefault).toBeDefined();
      expect(behavioralDefault?.prompt?.id).toBe(prompt2.id);
    });
  });

  describe("PUT /prompts/defaults", () => {
    it("should set a default prompt for a type", async () => {
      if (isAppMode) return;

      const {
        body: { data: created },
      } = await create({
        title: "Default Resume Prompt",
        prompt: "Default resume prompt",
        type: "resume",
        isPublic: false,
      });

      await auth(httpServer.put(`${routePath}/defaults`))
        .send({ type: "resume", promptId: created.id })
        .expect(200);
    });

    it("should update an existing default prompt for the same type", async () => {
      if (isAppMode) return;

      const {
        body: { data: original },
      } = await create({
        title: "Original Resume Default",
        prompt: "Original resume default",
        type: "resume",
        isPublic: false,
      });
      const {
        body: { data: replacement },
      } = await create({
        title: "Replacement Resume Default",
        prompt: "Replacement resume default",
        type: "resume",
        isPublic: false,
      });

      await auth(httpServer.put(`${routePath}/defaults`))
        .send({ type: "resume", promptId: original.id })
        .expect(200);

      await auth(httpServer.put(`${routePath}/defaults`))
        .send({ type: "resume", promptId: replacement.id })
        .expect(200);

      const { body } = await auth(
        httpServer.get(`${routePath}/defaults`),
      ).expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].promptId).toBe(replacement.id);
      expect(body.data[0].prompt.id).toBe(replacement.id);
    });

    it("should return 403 when setting another user's prompt as default", async () => {
      const {
        body: { data: created },
      } = await create({
        title: "Other User Prompt",
        prompt: "Other user prompt text for test",
        type: "resume",
        isPublic: false,
      });

      if (!isAppMode) {
        await auth(httpServer.put(`${routePath}/defaults`))
          .set("Cookie", adminAuthCookie)
          .send({ type: "resume", promptId: created.id })
          .expect(403);
      }
    });

    it("should return 403 when setting default with type mismatch", async () => {
      if (isAppMode) return;

      const {
        body: { data: created },
      } = await create({
        title: "Resume Prompt",
        prompt: "This is a resume prompt for testing type mismatch",
        type: "resume",
        isPublic: false,
      });

      await auth(httpServer.put(`${routePath}/defaults`))
        .send({ type: "behavioral", promptId: created.id })
        .expect(403);
    });

    it("should return 404 when setting default with non-existent prompt", async () => {
      if (isAppMode) return;

      await auth(httpServer.put(`${routePath}/defaults`))
        .send({ type: "resume", promptId: 99999 })
        .expect(404);
    });
  });

  describe("POST /prompts/validate", () => {
    it("should validate a valid prompt", async () => {
      const { body } = await auth(httpServer.post(`${routePath}/validate`))
        .send({
          prompt: "This is a valid prompt for testing validation",
          type: "resume",
        })
        .expect(201);

      expect(body.data).toMatchObject({
        shape: { pass: true, errors: [] },
        llmJudge: null,
      });
    });

    it("should return shape errors for invalid prompt", async () => {
      const { body } = await auth(httpServer.post(`${routePath}/validate`))
        .send({ prompt: "short", type: "resume" })
        .expect(201);

      expect(body.data.shape.pass).toBe(false);
      expect(body.data.shape.errors.length).toBeGreaterThan(0);
    });
  });

  describe("GET /prompts with search", () => {
    it("should return prompts matching search query", async () => {
      await create({
        ...getPromptPayload(),
        prompt: "UniqueSearchKeywordForTesting purposes here",
        isPublic: true,
      });
      await create({
        ...getPromptPayload(),
        prompt: "Some other content without the keyword",
        isPublic: true,
      });

      const { body } = await auth(
        httpServer.get(
          `${routePath}?scope=public&search=UniqueSearchKeywordForTesting`,
        ),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].prompt).toContain("UniqueSearchKeywordForTesting");
    });

    it("should return empty when no prompts match search", async () => {
      await create({ ...getPromptPayload(), isPublic: true });

      const { body } = await auth(
        httpServer.get(
          `${routePath}?scope=public&search=NonExistentSearchTerm`,
        ),
      ).expect(200);

      expect(body.data).toEqual([]);
    });
  });

  describe("GET /prompts with pagination", () => {
    it("should return paginated results", async () => {
      for (let i = 0; i < 5; i++) {
        await create({ ...getPromptPayload(), isPublic: true });
      }

      const { body } = await auth(
        httpServer.get(`${routePath}?scope=public&page=1&limit=2`),
      ).expect(200);

      expect(body.data).toHaveLength(2);

      const { body: page2 } = await auth(
        httpServer.get(`${routePath}?scope=public&page=2&limit=2`),
      ).expect(200);

      expect(page2.data).toHaveLength(2);
    });
  });

  describe("POST /prompts/:id/like (non-existent)", () => {
    it("should return 404 when liking non-existent prompt", async () => {
      if (isAppMode) return;

      await auth(httpServer.post(`${routePath}/99999/like`)).expect(404);
    });
  });

  describe("prompt max length validation", () => {
    it("should return 400 when title exceeds 50 characters", async () => {
      await auth(httpServer.post(routePath))
        .send({
          title: "x".repeat(51),
          prompt: "This is a valid prompt text for testing",
          type: "resume",
        })
        .expect(400);
    });

    it("should return 400 when prompt exceeds 3000 characters", async () => {
      await auth(httpServer.post(routePath))
        .send({
          title: "Valid Title",
          prompt: "x".repeat(3001),
          type: "resume",
        })
        .expect(400);
    });
  });
});
