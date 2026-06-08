import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";
import type { TPrepSessionInsert } from "@/src/database/database.types";

import {
  expectedPrepSessionStructure,
  getPrepSessionPayload,
} from "./prep-session.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("PrepSession (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let sessionPayload: TPrepSessionInsert;

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
    sessionPayload = getPrepSessionPayload();
    if (!isAppMode) {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      authCookie = cookie;
    }
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const createSession = (
    payload: Record<string, unknown> = getPrepSessionPayload(),
    userCookie?: string,
  ) =>
    auth(httpServer.post("/prep-session"), userCookie)
      .send(payload)
      .expect(201);

  describe("POST /prep-session", () => {
    it("should create a prep session", async () => {
      const payload = getPrepSessionPayload();
      const { body } = await createSession(payload);

      expect(body.statusCode).toBe(201);
      expect(body.message).toBe("");
      expect(body.data).toMatchObject({
        description: payload.description,
      });
      expect(body.data.id).toEqual(expect.any(String));
      expect(body.data.experience).toBeNull();
      expect(body.data.jobId).toBeNull();
      expect(body.data.roleId).toBeNull();
      if (!isAppMode) expect(body.data.userId).toEqual(expect.any(String));
    });

    it("should return 400 when description is missing", async () => {
      await auth(httpServer.post("/prep-session")).send({}).expect(400);
    });

    it("should return 400 when description is empty", async () => {
      await auth(httpServer.post("/prep-session"))
        .send({ description: "" })
        .expect(400);
    });

    it("should return 400 when description is whitespace only", async () => {
      await auth(httpServer.post("/prep-session"))
        .send({ description: "   " })
        .expect(400);
    });

    it("should create a session with experience", async () => {
      const experience = "5 years in backend development";
      const { body } = await auth(httpServer.post("/prep-session"))
        .send({ ...sessionPayload, experience })
        .expect(201);

      expect(body.data.experience).toBe(experience);
    });

    it("should create a session with a valid jobId", async () => {
      const { body: jobBody } = await auth(httpServer.post("/jobs"))
        .send({ title: "Engineer", description: "A role" })
        .expect(201);

      const jobId: string = jobBody.data.id;

      const { body } = await auth(httpServer.post("/prep-session"))
        .send({ ...sessionPayload, jobId })
        .expect(201);

      expect(body.data.jobId).toBe(jobId);
    });

    it("should create a session with a valid roleId", async () => {
      const { body: roleBody } = await auth(httpServer.post("/roles"))
        .send({ name: "Engineer" })
        .expect(201);

      const roleId: number = roleBody.data.id;

      const { body } = await auth(httpServer.post("/prep-session"))
        .send({ ...sessionPayload, roleId })
        .expect(201);

      expect(body.data.roleId).toBe(roleId);
    });

    it("should create a session with topicIds", async () => {
      const { body: topic1 } = await auth(httpServer.post("/topics"))
        .send({ name: "System Design" })
        .expect(201);
      const { body: topic2 } = await auth(httpServer.post("/topics"))
        .send({ name: "Algorithms" })
        .expect(201);

      const topicIds = [topic1.data.id, topic2.data.id];

      const { body } = await auth(httpServer.post("/prep-session"))
        .send({ ...sessionPayload, topicIds })
        .expect(201);

      expect(body.data.id).toEqual(expect.any(String));
    });

    it("should return 400 for non-integer roleId", async () => {
      await auth(httpServer.post("/prep-session"))
        .send({ ...sessionPayload, roleId: "abc" })
        .expect(400);
    });

    it("should return 400 for non-integer topicIds", async () => {
      await auth(httpServer.post("/prep-session"))
        .send({ ...sessionPayload, topicIds: ["abc"] })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.post("/prep-session").send(sessionPayload).expect(401);
    });
  });

  describe("GET /prep-session", () => {
    it("should return empty list when no sessions exist", async () => {
      const { body } = await auth(httpServer.get("/prep-session")).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return all sessions for the authenticated user", async () => {
      await createSession();
      await createSession();

      await auth(httpServer.get("/prep-session"))
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data).toHaveLength(2);
          expect(data[0]).toMatchObject(expectedPrepSessionStructure());
          expect(data[1]).toMatchObject(expectedPrepSessionStructure());
        });
    });

    it("should not return sessions belonging to other users in web mode", async () => {
      await createSession();

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );

      await httpServer
        .get("/prep-session")
        .set("Cookie", otherCookie)
        .expect(200)
        .expect(({ body: { data: userSession } }) => {
          expect(userSession).toHaveLength(isAppMode ? 1 : 0);
        });
    });

    it("should return only sessions belonging to other user in web mode", async () => {
      await createSession();

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      await createSession(getPrepSessionPayload(), otherCookie);
      await createSession(getPrepSessionPayload(), otherCookie);

      await httpServer
        .get("/prep-session")
        .set("Cookie", otherCookie)
        .expect(200)
        .expect(({ body: { data: otherUserSession } }) => {
          expect(otherUserSession).toHaveLength(isAppMode ? 3 : 2);
        });

      await auth(httpServer.get("/prep-session"))
        .expect(200)
        .expect(({ body: { data: userSession } }) => {
          expect(userSession).toHaveLength(isAppMode ? 3 : 1);
        });
    });

    it("should return sessions with all expected fields", async () => {
      const payload = getPrepSessionPayload();
      const {
        body: { data: created },
      } = await createSession(payload);

      const { body } = await auth(httpServer.get("/prep-session")).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        ...created,
      });
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get("/prep-session").expect(401);
    });
  });

  describe("GET /prep-session/:id", () => {
    it("should return a session by id", async () => {
      const {
        body: { data: created },
      } = await createSession();
      const sessionId: string = created.id;

      const { body } = await auth(
        httpServer.get(`/prep-session/${sessionId}`),
      ).expect(200);

      expect(body.data).toMatchObject({ ...created });
      expect(body.data).toMatchObject(expectedPrepSessionStructure());
      expect(body.data.questions).toEqual([]);
    });

    it("should return 404 trying to access other user's session by id in web mode", async () => {
      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      const {
        body: { data },
      } = await createSession(getPrepSessionPayload(), otherCookie);

      const sessionId: string = data.id;

      await auth(httpServer.get(`/prep-session/${sessionId}`)).expect(
        isAppMode ? 200 : 404,
      );
    });

    it("should return 404 for non-existent id", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await auth(httpServer.get(`/prep-session/${fakeId}`)).expect(404);
    });
  });

  describe("PATCH /prep-session/:id", () => {
    it("should update description", async () => {
      const payload = getPrepSessionPayload();
      const { body: created } = await createSession(payload);
      const sessionId: string = created.data.id;

      const newDescription = "New session description";

      await auth(httpServer.patch(`/prep-session/${sessionId}`))
        .send({ description: newDescription })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.description).toBe(newDescription);
          expect(data).toMatchObject({
            ...payload,
            description: newDescription,
          });
        });
    });

    it("should update multiple fields", async () => {
      const {
        body: { data: created },
      } = await createSession();
      const sessionId: string = created.id;

      const description = "Updated description";
      const experience = "Senior level";

      const { body } = await auth(
        httpServer.patch(`/prep-session/${sessionId}`),
      )
        .send({ description, experience })
        .expect(200);

      expect(body.data).toMatchObject({ description, experience });
    });

    it("should update roleId", async () => {
      const {
        body: { data: created },
      } = await createSession();
      const sessionId: string = created.id;

      const { body: roleBody } = await auth(httpServer.post("/roles"))
        .send({ name: "Manager" })
        .expect(201);

      const roleId: number = roleBody.data.id;

      await auth(httpServer.patch(`/prep-session/${sessionId}`))
        .send({ roleId })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.roleId).toBe(roleId);
        });
    });

    it("should update jobId", async () => {
      const {
        body: { data: created },
      } = await createSession();
      const sessionId: string = created.id;

      const { body: jobBody } = await auth(httpServer.post("/jobs"))
        .send({ title: "Engineer", description: "A role" })
        .expect(201);

      const jobId: string = jobBody.data.id;

      await auth(httpServer.patch(`/prep-session/${sessionId}`))
        .send({ jobId })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.jobId).toBe(jobId);
        });
    });

    it("should return 400 when patching with empty description", async () => {
      const {
        body: { data: created },
      } = await createSession();
      const sessionId: string = created.id;

      await auth(httpServer.patch(`/prep-session/${sessionId}`))
        .send({ description: "" })
        .expect(400);
    });

    it("should return 404 when patching non-existent session", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await auth(httpServer.patch(`/prep-session/${fakeId}`))
        .send({ description: "Nope" })
        .expect(404);
    });

    it("should return 404 when patching another user's session", async () => {
      const {
        body: { data: created },
      } = await createSession();
      const sessionId: string = created.id;

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      await httpServer
        .patch(`/prep-session/${sessionId}`)
        .set("Cookie", otherCookie)
        .send({ description: "Hacked" })
        .expect(isAppMode ? 200 : 404);
    });
  });

  describe("DELETE /prep-session/:id", () => {
    it("should delete a session and return 204", async () => {
      const { body: created } = await createSession();
      const sessionId: string = created.data.id;

      await auth(httpServer.delete(`/prep-session/${sessionId}`)).expect(204);
    });

    it("should remove the session from the list after deletion", async () => {
      const { body: created } = await createSession();
      const sessionId: string = created.data.id;
      await createSession();
      await createSession();

      await auth(httpServer.delete(`/prep-session/${sessionId}`)).expect(204);

      const { body } = await auth(httpServer.get("/prep-session")).expect(200);
      const ids = (body.data as { id: string }[]).map((s) => s.id);
      expect(ids).not.toContain(sessionId);
    });

    it("should not affect other sessions when deleting one", async () => {
      const { body: session1 } = await createSession();
      const session1Id: string = session1.data.id;
      await createSession();
      await createSession();

      await auth(httpServer.delete(`/prep-session/${session1Id}`)).expect(204);

      const { body } = await auth(httpServer.get("/prep-session")).expect(200);
      expect(body.data).toHaveLength(2);
    });

    it("should return 404 when deleting non-existent session", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const { body } = await auth(
        httpServer.delete(`/prep-session/${fakeId}`),
      ).expect(404);

      expect(body.statusCode).toBe(404);
    });

    it("should return 404 when deleting another user's session", async () => {
      if (isAppMode) return;

      const { body: created } = await createSession();
      const sessionId: string = created.data.id;

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      const { body } = await httpServer
        .delete(`/prep-session/${sessionId}`)
        .set("Cookie", otherCookie)
        .expect(404);

      expect(body.statusCode).toBe(404);
    });
  });

  describe("Question operations", () => {
    let sessionId: string;

    beforeEach(async () => {
      const { body } = await createSession();
      sessionId = body.data.id;
    });

    const createQuestion = (data: Record<string, unknown> = {}) =>
      auth(httpServer.post(`/prep-session/${sessionId}/questions`))
        .send(data)
        .expect(201);

    describe("POST /prep-session/:sessionId/questions", () => {
      it("should add a question to a session", async () => {
        const { body } = await createQuestion();

        expect(body.statusCode).toBe(201);
        expect(body.data.id).toEqual(expect.any(Number));
        expect(body.data.sessionId).toBe(sessionId);
        expect(body.data.answer).toBeNull();
        expect(body.data.notes).toBeNull();
        expect(body.data.isFavorite).toBe(false);
      });

      it("should add a question with answer and notes", async () => {
        const answer = "This is my answer";
        const notes = "Some notes";

        const { body } = await createQuestion({ answer, notes });

        expect(body.data.answer).toBe(answer);
        expect(body.data.notes).toBe(notes);
      });

      it("should add a question marked as favorite", async () => {
        const { body } = await createQuestion({ isFavorite: true });

        expect(body.data.isFavorite).toBe(true);
      });

      it("should return 400 for invalid isFavorite type", async () => {
        await auth(httpServer.post(`/prep-session/${sessionId}/questions`))
          .send({ isFavorite: "not-a-boolean" })
          .expect(400);
      });
    });

    describe("GET /prep-session/:sessionId/questions", () => {
      it("should return empty list when no questions exist", async () => {
        const { body } = await auth(
          httpServer.get(`/prep-session/${sessionId}/questions`),
        ).expect(200);

        expect(body.data).toEqual([]);
      });

      it("should return all questions for a session", async () => {
        await createQuestion();
        await createQuestion();

        const { body } = await auth(
          httpServer.get(`/prep-session/${sessionId}/questions`),
        ).expect(200);

        expect(body.data).toHaveLength(2);
        expect(body.data[0].sessionId).toBe(sessionId);
        expect(body.data[1].sessionId).toBe(sessionId);
      });

      it("should return questions with all expected fields", async () => {
        await createQuestion({ answer: "Test answer", notes: "Test notes" });

        const { body } = await auth(
          httpServer.get(`/prep-session/${sessionId}/questions`),
        ).expect(200);

        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({
          id: expect.any(Number),
          sessionId,
          answer: "Test answer",
          notes: "Test notes",
          isFavorite: false,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        });
      });

      it("should paginate questions", async () => {
        for (let i = 0; i < 5; i++) {
          await createQuestion();
        }

        const { body } = await auth(
          httpServer.get(`/prep-session/${sessionId}/questions?page=1&limit=3`),
        ).expect(200);

        expect(body.data).toHaveLength(3);
      });
    });

    describe("PATCH /prep-session/questions/:id", () => {
      it("should update question answer", async () => {
        const { body: question } = await createQuestion();
        const questionId: number = question.data.id;

        const answer = "Updated answer";

        await auth(httpServer.patch(`/prep-session/questions/${questionId}`))
          .send({ answer })
          .expect(200)
          .expect(({ body: { data } }) => {
            expect(data.answer).toBe(answer);
          });
      });

      it("should update question notes", async () => {
        const { body: question } = await createQuestion();
        const questionId: number = question.data.id;

        const notes = "Updated notes";

        await auth(httpServer.patch(`/prep-session/questions/${questionId}`))
          .send({ notes })
          .expect(200)
          .expect(({ body: { data } }) => {
            expect(data.notes).toBe(notes);
          });
      });

      it("should toggle isFavorite", async () => {
        const { body: question } = await createQuestion();
        const questionId: number = question.data.id;

        await auth(httpServer.patch(`/prep-session/questions/${questionId}`))
          .send({ isFavorite: true })
          .expect(200)
          .expect(({ body: { data } }) => {
            expect(data.isFavorite).toBe(true);
          });
      });

      it("should update multiple fields at once", async () => {
        const { body: question } = await createQuestion();
        const questionId: number = question.data.id;

        await auth(httpServer.patch(`/prep-session/questions/${questionId}`))
          .send({ answer: "New answer", notes: "New notes", isFavorite: true })
          .expect(200)
          .expect(({ body: { data } }) => {
            expect(data.answer).toBe("New answer");
            expect(data.notes).toBe("New notes");
            expect(data.isFavorite).toBe(true);
          });
      });

      it("should return 404 when patching non-existent question", async () => {
        await auth(httpServer.patch("/prep-session/questions/99999"))
          .send({ answer: "Nope" })
          .expect(404);
      });
    });

    describe("DELETE /prep-session/questions/:id", () => {
      it("should delete a question and return 204", async () => {
        const { body: question } = await createQuestion();
        const questionId: number = question.data.id;

        await auth(
          httpServer.delete(`/prep-session/questions/${questionId}`),
        ).expect(204);
      });

      it("should remove the question from the list after deletion", async () => {
        const { body: q1 } = await createQuestion();
        const q1Id: number = q1.data.id;
        await createQuestion();
        await createQuestion();

        await auth(httpServer.delete(`/prep-session/questions/${q1Id}`)).expect(
          204,
        );

        const { body } = await auth(
          httpServer.get(`/prep-session/${sessionId}/questions`),
        ).expect(200);
        const ids = (body.data as { id: number }[]).map((q) => q.id);
        expect(ids).not.toContain(q1Id);
      });

      it("should not affect other questions when deleting one", async () => {
        const { body: q1 } = await createQuestion();
        const q1Id: number = q1.data.id;
        await createQuestion();
        await createQuestion();

        await auth(httpServer.delete(`/prep-session/questions/${q1Id}`)).expect(
          204,
        );

        const { body } = await auth(
          httpServer.get(`/prep-session/${sessionId}/questions`),
        ).expect(200);
        expect(body.data).toHaveLength(2);
      });

      it("should return 404 when deleting non-existent question", async () => {
        await auth(httpServer.delete("/prep-session/questions/99999")).expect(
          404,
        );
      });
    });
  });
});
