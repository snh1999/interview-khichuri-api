import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import { getNotePayload } from "./notes.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);
const routePath = "/notes";

describe("Notes (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let authUserId: string | undefined;
  let adminAuthCookie: string;
  let adminUserId: string | undefined;

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
      const { cookie, userId } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      authCookie = cookie;
      authUserId = userId;

      const { cookie: adminCookie, userId: adminId } = await getTestAuthHeader(
        app,
        dbService.database(),
        { role: "admin" },
      );
      adminAuthCookie = adminCookie;
      adminUserId = adminId;
    }
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const create = (
    payload: Record<string, unknown> = getNotePayload(),
    userCookie?: string,
  ) => auth(httpServer.post(routePath), userCookie).send(payload).expect(201);

  interface TSeedSession {
    sessionId: string;
    questionId: number;
  }

  const seedLinkedQuestion = async (userId: string): Promise<TSeedSession> => {
    const session = await dbService.create("prep_session", {
      userId,
      title: "Test session",
    });
    const question = await dbService.create("questions", {
      sessionId: session.id,
      questionText: "Tell me about yourself",
    });
    return { sessionId: session.id, questionId: question.id };
  };

  describe("POST /notes", () => {
    it("should create a note", async () => {
      const payload = getNotePayload();
      const { body } = await create(payload);

      expect(body.statusCode).toBe(201);
      expect(body.data).toMatchObject({
        title: payload.title,
        details: payload.details,
        isFavorite: payload.isFavorite,
        ...(isAppMode ? { userId: null } : { userId: authUserId }),
      });
      expect(body.data).not.toHaveProperty("isTemplate");
      expect(body.data).not.toHaveProperty("questionType");
      expect(body.data).not.toHaveProperty("tags");
      expect(body.data.id).toEqual(expect.any(String));
    });

    it("should create a note linked to a question", async () => {
      if (isAppMode) return;
      const { questionId } = await seedLinkedQuestion(authUserId ?? "");

      const { body } = await create(getNotePayload({ questionId }));

      expect(body.data.questionId).toBe(questionId);
      expect(body.data.jobId).toBeNull();
    });

    it("should return 400 when both questionId and jobId are set", async () => {
      if (isAppMode) return;
      const { questionId } = await seedLinkedQuestion(authUserId ?? "");
      const job = await dbService.create("jobs", {
        userId: authUserId,
        title: "Test job",
        companyName: "Acme",
        description: "Job description",
      });

      await auth(httpServer.post(routePath))
        .send(
          getNotePayload({
            questionId,
            jobId: job.id,
          }),
        )
        .expect(400);
    });

    it("should return 400 when title is empty", async () =>
      auth(httpServer.post(routePath)).send({ title: "" }).expect(400));

    it("should return 400 when jobId is not a uuid", async () =>
      auth(httpServer.post(routePath))
        .send({ title: "test", jobId: "not-a-uuid" })
        .expect(400));

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.post(routePath).send(getNotePayload()).expect(401);
    });
  });

  describe("GET /notes", () => {
    it("should return empty list when no notes exist", async () => {
      const { body } = await auth(httpServer.get(routePath)).expect(200);
      expect(body.data).toEqual([]);
    });

    it("should return only the user's own notes", async () => {
      await create(getNotePayload());
      if (!isAppMode) {
        await dbService.create("notes", {
          ...getNotePayload(),
          userId: adminUserId,
        });
      }

      const { body } = await auth(httpServer.get(routePath)).expect(200);
      expect(body.data).toHaveLength(1);
    });

    it("should filter by isFavorite", async () => {
      await create(getNotePayload({ isFavorite: true }));
      await create(getNotePayload({ isFavorite: false }));

      const { body } = await auth(
        httpServer.get(`${routePath}?isFavorite=true`),
      ).expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].isFavorite).toBe(true);
    });

    it("should search notes by title", async () => {
      await create(getNotePayload({ title: "UniqueKeywordTitle here" }));
      await create(getNotePayload({ title: "Something else entirely" }));

      const { body } = await auth(
        httpServer.get(`${routePath}?search=UniqueKeywordTitle`),
      ).expect(200);
      expect(body.data).toHaveLength(1);
    });

    it("should search notes by details", async () => {
      await create(getNotePayload({ details: "OutstandingParagraph here" }));
      await create(getNotePayload({ details: "Unrelated content" }));

      const { body } = await auth(
        httpServer.get(`${routePath}?search=OutstandingParagraph`),
      ).expect(200);
      expect(body.data).toHaveLength(1);
    });

    it("should include the linked job title", async () => {
      if (isAppMode) return;
      const job = await dbService.create("jobs", {
        userId: authUserId,
        title: "Senior Frontend Engineer",
        companyName: "Acme",
        description: "Job description",
      });
      await create(getNotePayload({ jobId: job.id, questionId: undefined }));

      const { body } = await auth(httpServer.get(routePath)).expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].jobId).toBe(job.id);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get(routePath).expect(401);
    });
  });

  describe("GET /notes/:id", () => {
    it("should return a note by id", async () => {
      const {
        body: { data: created },
      } = await create();

      const { body } = await auth(
        httpServer.get(`${routePath}/${created.id}`),
      ).expect(200);
      expect(body.data.id).toBe(created.id);
      expect(body.data.title).toBe(created.title);
    });

    it("should include the linked job title", async () => {
      if (isAppMode) return;
      const job = await dbService.create("jobs", {
        userId: authUserId,
        title: "Senior Frontend Engineer",
        companyName: "Acme",
        description: "Job description",
      });
      const {
        body: { data: created },
      } = await create(
        getNotePayload({ jobId: job.id, questionId: undefined }),
      );

      const { body } = await auth(
        httpServer.get(`${routePath}/${created.id}`),
      ).expect(200);
      expect(body.data.jobId).toBe(job.id);
      expect(body.data.jobTitle).toBe("Senior Frontend Engineer");
    });

    it("should return 404 when note does not exist", async () => {
      await auth(
        httpServer.get(`${routePath}/00000000-0000-0000-0000-000000000000`),
      ).expect(404);
    });

    it("should return 403 when accessing another user's note", async () => {
      if (isAppMode) return;
      const {
        body: { data: created },
      } = await create();

      await auth(
        httpServer.get(`${routePath}/${created.id}`),
        adminAuthCookie,
      ).expect(403);
    });
  });

  describe("PATCH /notes/:id", () => {
    it("should update own note", async () => {
      const {
        body: { data: created },
      } = await create();

      const { body } = await auth(
        httpServer.patch(`${routePath}/${created.id}`),
      )
        .send({ title: "Updated title here" })
        .expect(200);

      expect(body.data.title).toBe("Updated title here");
    });

    it("should not change attachments on update", async () => {
      if (isAppMode) return;
      const { questionId } = await seedLinkedQuestion(authUserId ?? "");
      const {
        body: { data: created },
      } = await create(getNotePayload({ questionId }));

      const { body } = await auth(
        httpServer.patch(`${routePath}/${created.id}`),
      )
        .send({ title: "Updated", questionId: null })
        .expect(200);

      expect(body.data.questionId).toBe(questionId);
      expect(body.data.title).toBe("Updated");
    });

    it("should return 403 when updating another user's note", async () => {
      if (isAppMode) return;
      const {
        body: { data: created },
      } = await create();

      await auth(httpServer.patch(`${routePath}/${created.id}`))
        .set("Cookie", adminAuthCookie)
        .send({ title: "Hacked title" })
        .expect(403);
    });

    it("should return 404 when updating non-existent note", async () => {
      await auth(
        httpServer.patch(`${routePath}/00000000-0000-0000-0000-000000000000`),
      )
        .send({ title: "Does not exist" })
        .expect(404);
    });
  });

  describe("DELETE /notes/:id", () => {
    it("should delete own note", async () => {
      const {
        body: { data: created },
      } = await create();
      await auth(httpServer.delete(`${routePath}/${created.id}`)).expect(204);
    });

    it("should return 403 when deleting another user's note", async () => {
      if (isAppMode) return;
      const {
        body: { data: created },
      } = await create();

      await auth(httpServer.delete(`${routePath}/${created.id}`))
        .set("Cookie", adminAuthCookie)
        .expect(403);
    });

    it("should return 404 when deleting non-existent note", async () => {
      await auth(
        httpServer.delete(`${routePath}/00000000-0000-0000-0000-000000000000`),
      ).expect(404);
    });
  });
});
