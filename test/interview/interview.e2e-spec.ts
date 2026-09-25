import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type supertest from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AppModule } from "@/src/app.module";
import { IDatabaseService } from "@/src/database/database.service";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";

import { getCompletionPayload } from "./interview.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";

const isAppMode = Boolean(process.env.IS_APP_MODE);
const routePath = "/interviews";

describe("Interview (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let genAiMock: {
    generateStructured: ReturnType<typeof vi.fn>;
    generateInterviewQuestions: ReturnType<typeof vi.fn>;
    generateInterviewFollowUps: ReturnType<typeof vi.fn>;
  };

  const evaluation = {
    overall: 72,
    technical: 68,
    communication: 80,
    summaryMarkdown: "Solid interview with room to deepen technical answers.",
    strengths: ["Clear communication", "Good structure"],
    improvements: ["Add more technical depth", "Quantify results"],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GenAiService)
      .useValue({
        generateStructured: vi.fn(),
        generateInterviewQuestions: vi.fn(),
        generateInterviewFollowUps: vi.fn(),
      })
      .compile();

    app = module.createNestApplication();
    const http = app.getHttpServer();
    await app.init();

    httpServer = request(http as Parameters<typeof request>[0]);
    dbService = app.get<IDatabaseService>(IDatabaseService);
    genAiMock = app.get<GenAiService>(GenAiService) as unknown as {
      generateStructured: ReturnType<typeof vi.fn>;
      generateInterviewQuestions: ReturnType<typeof vi.fn>;
      generateInterviewFollowUps: ReturnType<typeof vi.fn>;
    };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await dbService.dbClear();
    if (!isAppMode) {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      authCookie = cookie;
    }
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const createSession = async (): Promise<string> => {
    const { body } = await auth(httpServer.post("/prep-session"))
      .send({ title: "Test Session", description: "For mock interview" })
      .expect(201);
    return body.data.id as string;
  };

  const generatedQuestions = {
    questions: [
      {
        questionText: "Tell me about your experience?",
        answer: "Expected answer",
        notes: "Hint",
      },
    ],
  };

  const createInterview = async (sessionId: string): Promise<string> => {
    genAiMock.generateInterviewQuestions.mockResolvedValue(generatedQuestions);
    const { body } = await auth(httpServer.post(routePath))
      .send({ sessionId, mode: "qa_flow", provider: "google" })
      .expect(201);
    return body.data.interview.id as string;
  };

  describe("POST /interviews", () => {
    it("should create an interview for a session with generated questions", async () => {
      genAiMock.generateInterviewQuestions.mockResolvedValue(
        generatedQuestions,
      );
      const sessionId = await createSession();

      const { body } = await auth(httpServer.post(routePath))
        .send({ sessionId, mode: "qa_flow", provider: "google" })
        .expect(201);

      expect(body.statusCode).toBe(201);
      expect(body.data.interview.sessionId).toBe(sessionId);
      expect(body.data.interview.completedAt).toBeNull();
      expect(body.data.interview.id).toEqual(expect.any(String));
      expect(body.data.questions).toHaveLength(1);
    });

    it("should return 400 when sessionId is invalid", async () => {
      await auth(httpServer.post(routePath))
        .send({ sessionId: "not-a-uuid", mode: "qa_flow", provider: "google" })
        .expect(400);
    });

    it("should return 400 when provider is missing", async () => {
      const sessionId = await createSession();
      await auth(httpServer.post(routePath))
        .send({ sessionId, mode: "qa_flow" })
        .expect(400);
    });

    it("should return 404 when session does not exist", async () => {
      await auth(httpServer.post(routePath))
        .send({
          sessionId: "00000000-0000-0000-0000-000000000000",
          mode: "qa_flow",
          provider: "google",
        })
        .expect(404);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      const sessionId = await createSession();
      await httpServer
        .post(routePath)
        .send({ sessionId, mode: "qa_flow", provider: "google" })
        .expect(401);
    });
  });

  describe("GET /interviews/:id", () => {
    it("should return an interview by id", async () => {
      const sessionId = await createSession();
      const id = await createInterview(sessionId);

      const { body } = await auth(httpServer.get(`${routePath}/${id}`)).expect(
        200,
      );

      expect(body.data.id).toBe(id);
      expect(body.data.sessionId).toBe(sessionId);
    });

    it("should return 404 when interview does not exist", async () => {
      await auth(
        httpServer.get(`${routePath}/00000000-0000-0000-0000-000000000000`),
      ).expect(404);
    });
  });

  describe("GET /interviews?sessionId=", () => {
    it("should return empty list when no interviews exist", async () => {
      const sessionId = await createSession();

      const { body } = await auth(
        httpServer.get(routePath).query({ sessionId }),
      ).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return interviews for a session", async () => {
      const sessionId = await createSession();
      await createInterview(sessionId);
      await createInterview(sessionId);

      const { body } = await auth(
        httpServer.get(routePath).query({ sessionId }),
      ).expect(200);

      expect(body.data).toHaveLength(2);
    });

    it("should return 404 when session does not exist", async () => {
      await auth(
        httpServer.get(routePath).query({
          sessionId: "00000000-0000-0000-0000-000000000000",
        }),
      ).expect(404);
    });
  });

  describe("POST /interviews/:id/complete", () => {
    it("should complete an interview with an evaluation", async () => {
      genAiMock.generateStructured.mockResolvedValue(evaluation);
      const sessionId = await createSession();
      const id = await createInterview(sessionId);

      const { body } = await auth(
        httpServer.post(`${routePath}/${id}/complete`),
      )
        .send(getCompletionPayload({ elapsedSeconds: 754 }))
        .expect(201);

      expect(body.data.completedAt).not.toBeNull();
      expect(body.data.overallScore).toBe(evaluation.overall);
      expect(body.data.technicalScore).toBe(evaluation.technical);
      expect(body.data.communicationScore).toBe(evaluation.communication);
      expect(body.data.summaryMarkdown).toBe(evaluation.summaryMarkdown);
      expect(body.data.strengths).toEqual(evaluation.strengths);
      expect(body.data.improvements).toEqual(evaluation.improvements);
      expect(body.data.elapsedSeconds).toBe(754);
    });

    it("should return 400 when interview is already completed", async () => {
      genAiMock.generateStructured.mockResolvedValue(evaluation);
      const sessionId = await createSession();
      const id = await createInterview(sessionId);

      await auth(httpServer.post(`${routePath}/${id}/complete`))
        .send(getCompletionPayload())
        .expect(201);

      await auth(httpServer.post(`${routePath}/${id}/complete`))
        .send(getCompletionPayload())
        .expect(400);
    });

    it("should return 404 when interview does not exist", async () => {
      await auth(
        httpServer.post(
          `${routePath}/00000000-0000-0000-0000-000000000000/complete`,
        ),
      )
        .send(getCompletionPayload())
        .expect(404);
    });

    it("should return 400 when transcript is invalid", async () => {
      const sessionId = await createSession();
      const id = await createInterview(sessionId);

      await auth(httpServer.post(`${routePath}/${id}/complete`))
        .send({ provider: "google", transcript: [], elapsedSeconds: 10 })
        .expect(400);
    });
  });

  describe("DELETE /interviews/:id", () => {
    it("should delete an interview", async () => {
      const sessionId = await createSession();
      const id = await createInterview(sessionId);

      await auth(httpServer.delete(`${routePath}/${id}`)).expect(204);

      await auth(httpServer.get(`${routePath}/${id}`)).expect(404);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      const sessionId = await createSession();
      const id = await createInterview(sessionId);

      await httpServer.delete(`${routePath}/${id}`).expect(401);
    });

    it("should return 404 when interview does not exist", async () => {
      await auth(
        httpServer.delete(`${routePath}/00000000-0000-0000-0000-000000000000`),
      ).expect(404);
    });
  });
});
