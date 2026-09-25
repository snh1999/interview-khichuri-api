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

import { getResumeContentPayload } from "./resume.test-data";
import { getCompanyPayload } from "../company/company.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Resume ATS Score (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let testUserId: string | undefined;
  let genAiMock: { scoreResumeForJob: ReturnType<typeof vi.fn> };

  const atsResult = {
    overall: 82,
    categories: {
      skillsMatch: 90,
      keywordHitRate: 78,
      experienceFit: 75,
      roleAlignment: 80,
    },
    recommendations: ["Add more keywords"],
    matchedKeywords: ["react", "typescript"],
    missingKeywords: ["graphql"],
    tailoringNotes: "Mention open source work",
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GenAiService)
      .useValue({ scoreResumeForJob: vi.fn() })
      .compile();

    app = module.createNestApplication();
    const http = app.getHttpServer();
    await app.init();

    httpServer = request(http as Parameters<typeof request>[0]);
    dbService = app.get<IDatabaseService>(IDatabaseService);
    genAiMock = app.get<GenAiService>(GenAiService) as unknown as {
      scoreResumeForJob: ReturnType<typeof vi.fn>;
    };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await dbService.dbClear();

    const { cookie, userId } = await getTestAuthHeader(
      app,
      dbService.database(),
    );
    authCookie = cookie;
    testUserId = userId ?? "app";

    await dbService.create("profiles", {
      id: testUserId,
      firstName: "",
      lastName: "",
    });
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const setup = async () => {
    const company = await dbService.create("companies", getCompanyPayload());
    const companyName = (company as { name: string }).name;

    const resume = await dbService.create("resume", {
      profileId: testUserId ?? "app",
      name: "Content Resume",
      content: JSON.stringify(getResumeContentPayload()),
    });

    const job = await dbService.create("jobs", {
      userId: testUserId ?? "app",
      title: "Frontend Engineer",
      companyName,
      companyId: (company as { id: number }).id,
      description: "Build React UIs with TypeScript",
      status: "saved",
    });

    return { resume, job };
  };

  describe("POST /resume/score", () => {
    it("scores a content resume against a job with a linked company", async () => {
      const { resume, job } = await setup();
      genAiMock.scoreResumeForJob.mockResolvedValue(atsResult);

      const { body } = await auth(httpServer.post("/resume/score"))
        .send({ jobId: job.id, resumeId: resume.id, provider: "openai" })
        .expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data).toEqual(atsResult);
    });

    it("passes company details when a dossier is present", async () => {
      const companyName = "Acme Corp";
      const company = await dbService.create("companies", {
        name: companyName,
      });
      await dbService.update(
        "companies",
        { researchDossier: JSON.stringify({ mission: "Great products" }) },
        { name: companyName },
      );

      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "Content Resume",
        content: JSON.stringify(getResumeContentPayload()),
      });
      const job = await dbService.create("jobs", {
        userId: testUserId ?? "app",
        title: "Frontend Engineer",
        companyName,
        companyId: (company as { id: number }).id,
        description: "Build React UIs with TypeScript",
        status: "saved",
      });
      genAiMock.scoreResumeForJob.mockResolvedValue(atsResult);

      await auth(httpServer.post("/resume/score"))
        .send({ jobId: job.id, resumeId: resume.id, provider: "openai" })
        .expect(200);

      const arg = genAiMock.scoreResumeForJob.mock.calls[0][0] as {
        companyDetails: string;
        jobDescription: string;
      };
      expect(arg.jobDescription).toBe("Build React UIs with TypeScript");
      expect(arg.companyDetails).toContain("Great products");
    });

    it("returns 400 when the job has no description", async () => {
      const { resume } = await setup();
      const job = await dbService.create("jobs", {
        userId: testUserId ?? "app",
        title: "No desc",
        companyName: "Some Co",
        description: "",
        status: "saved",
      });

      await auth(httpServer.post("/resume/score"))
        .send({ jobId: job.id, resumeId: resume.id, provider: "openai" })
        .expect(400);
    });

    it("returns 404 when the resume belongs to another user", async () => {
      if (isAppMode) return;
      const { job } = await setup();

      const { userId: otherUserId } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      const otherProfileId = otherUserId ?? "other-user";
      await dbService.create("profiles", {
        id: otherProfileId,
        firstName: "Other",
        lastName: "User",
      });
      const otherResume = await dbService.create("resume", {
        profileId: otherProfileId,
        name: "Other Resume",
        content: JSON.stringify(getResumeContentPayload()),
      });

      await auth(httpServer.post("/resume/score"))
        .send({ jobId: job.id, resumeId: otherResume.id, provider: "openai" })
        .expect(404);
    });

    it("returns 404 when the job is not found", async () => {
      const { resume } = await setup();

      await auth(httpServer.post("/resume/score"))
        .send({
          jobId: crypto.randomUUID(),
          resumeId: resume.id,
          provider: "openai",
        })
        .expect(404);
    });

    it("returns 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer
        .post("/resume/score")
        .send({
          jobId: crypto.randomUUID(),
          resumeId: crypto.randomUUID(),
          provider: "openai",
        })
        .expect(401);
    });
  });
});
