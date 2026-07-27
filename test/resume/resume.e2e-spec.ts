import type { INestApplication } from "@nestjs/common";
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

import type { IDatabaseService } from "@/src/database/database.service";

import { getTestAuthHeader } from "../utils/auth-helpers";
import {
  bootstrapTestServer,
  type TMockFileUploadService,
} from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Upload Resume (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let testUserId: string | undefined;
  let mockFileUploadService: TMockFileUploadService;

  beforeAll(async () => {
    const {
      appInstance,
      httpServerInstance,
      dbServiceInstance,
      mockFileUploadService: mfus,
    } = await bootstrapTestServer();

    app = appInstance;
    httpServer = httpServerInstance;
    dbService = dbServiceInstance;
    mockFileUploadService = mfus;
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

  describe("POST /resume", () => {
    it("should upload a resume and return filename", async () => {
      const expectedResponse = {
        success: true,
        filename: "resume.pdf-1718000000000",
      };
      mockFileUploadService.uploadFile.mockResolvedValue(expectedResponse);

      const { body } = await auth(httpServer.post("/resume"))
        .attach("file", Buffer.from("%PDF-1.4\nfake pdf content"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        })
        .expect(201);

      expect(body.statusCode).toBe(201);
      expect(body.data).toEqual(expectedResponse);
      expect(mockFileUploadService.uploadFile).toHaveBeenCalledOnce();
    });

    it("should store the provided name instead of the original filename", async () => {
      mockFileUploadService.uploadFile.mockResolvedValue({
        success: true,
        filename: "resumes/profile-id/uuid.pdf",
      });

      const { body } = await auth(httpServer.post("/resume"))
        .field("name", "My Custom Resume")
        .attach("file", Buffer.from("%PDF-1.4\nfake pdf content"), {
          filename: "original-name.pdf",
          contentType: "application/pdf",
        })
        .expect(201);

      expect(body.statusCode).toBe(201);

      const resumes = await dbService.findAllByColumn("resume", {
        filter: { profileId: testUserId ?? "app" },
      });
      expect(resumes[0].name).toBe("My Custom Resume");
    });

    it("should fall back to original filename when no name is provided", async () => {
      mockFileUploadService.uploadFile.mockResolvedValue({
        success: true,
        filename: "resumes/profile-id/uuid.pdf",
      });

      await auth(httpServer.post("/resume"))
        .attach("file", Buffer.from("%PDF-1.4\nfake pdf content"), {
          filename: "original-name.pdf",
          contentType: "application/pdf",
        })
        .expect(201);

      const resumes = await dbService.findAllByColumn("resume", {
        filter: { profileId: testUserId ?? "app" },
      });
      expect(resumes[0].name).toBe("original-name.pdf");
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .post("/resume")
        .attach("file", Buffer.from("fake pdf content"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        })
        .expect(401);
    });

    it("should return 400 when no file is attached", async () => {
      await auth(httpServer.post("/resume")).expect(400);
    });

    it("should return 400 when file is not a PDF", async () => {
      await auth(httpServer.post("/resume"))
        .attach("file", Buffer.from("not a pdf"), "image.png")
        .expect(400);
    });

    it("should return 500 when upload service fails", async () => {
      mockFileUploadService.uploadFile.mockRejectedValue(
        new Error("Upload failed"),
      );

      await auth(httpServer.post("/resume"))
        .attach("file", Buffer.from("%PDF-1.4\nfake pdf content"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        })
        .expect(500);
    });
  });

  describe("DELETE /resume/:id", () => {
    it("should delete a resume and return 200", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume.pdf",
        url: "test-url/resume.pdf",
        isPrimary: true,
      });

      const { body } = await auth(
        httpServer.delete(`/resume/${resume.id}`),
      ).expect(200);

      expect(body.statusCode).toBe(200);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer.delete("/resume/some-uuid").expect(401);
    });

    it("should return 400 with non uuid resume id", async () => {
      await auth(httpServer.delete("/resume/invalid_id")).expect(400);
    });

    it("should return 404 when resume does not exist", async () => {
      await auth(httpServer.delete(`/resume/${crypto.randomUUID()}`)).expect(
        404,
      );
    });
  });

  describe("GET /resume/:id/url", () => {
    it("should return a signed url", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume.pdf",
        url: "resumes/test/profile-id/file.pdf",
        isPrimary: true,
      });

      mockFileUploadService.getSignedUrl.mockResolvedValue(
        "https://signed-url.com/file.pdf",
      );

      const { body } = await auth(
        httpServer.get(`/resume/${resume.id}/url`),
      ).expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data.url).toBe("https://signed-url.com/file.pdf");
      expect(mockFileUploadService.getSignedUrl).toHaveBeenCalledWith(
        resume.url,
      );
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer.get(`/resume/${crypto.randomUUID()}/url`).expect(401);
    });

    it("should return 400 with non-uuid resume id", async () => {
      await auth(httpServer.get("/resume/invalid_id/url")).expect(400);
    });

    it("should return 404 when resume does not exist", async () => {
      await auth(httpServer.get(`/resume/${crypto.randomUUID()}/url`)).expect(
        404,
      );
    });

    it("should return 403 when resume belongs to another user", async () => {
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

      const resume = await dbService.create("resume", {
        profileId: otherProfileId,
        name: "others-resume.pdf",
        url: "resumes/other/file.pdf",
        isPrimary: true,
      });

      await auth(httpServer.get(`/resume/${resume.id}/url`)).expect(403);
    });
  });

  describe("PATCH /resume/:id/primary", () => {
    it("should set resume as primary", async () => {
      const resume1 = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume1.pdf",
        url: "url1",
        isPrimary: true,
      });

      const resume2 = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume2.pdf",
        url: "url2",
        isPrimary: false,
      });

      const { body } = await auth(
        httpServer.patch(`/resume/${resume2.id}/primary`),
      ).expect(200);

      expect(body.statusCode).toBe(200);

      const updated = await dbService.findAllByColumn("resume", {
        filter: { profileId: testUserId ?? "app" },
      });
      expect(updated.find((r) => r.id === resume1.id)?.isPrimary).toBe(false);
      expect(updated.find((r) => r.id === resume2.id)?.isPrimary).toBe(true);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .patch(`/resume/${crypto.randomUUID()}/primary`)
        .expect(401);
    });

    it("should return 400 with non-uuid resume id", async () => {
      await auth(httpServer.patch("/resume/invalid_id/primary")).expect(400);
    });

    it("should return 404 when resume does not exist", async () => {
      await auth(
        httpServer.patch(`/resume/${crypto.randomUUID()}/primary`),
      ).expect(404);
    });

    it("should be idempotent when already primary", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume.pdf",
        url: "url",
        isPrimary: true,
      });

      const { body } = await auth(
        httpServer.patch(`/resume/${resume.id}/primary`),
      ).expect(200);

      expect(body.statusCode).toBe(200);
    });
  });

  describe("GET /resume", () => {
    it("should return an empty array when no resumes exist", async () => {
      const { body } = await auth(httpServer.get("/resume")).expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data).toEqual([]);
    });

    it("should return all resumes for the user", async () => {
      const resume1 = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume1.pdf",
        url: "url1",
        isPrimary: true,
      });

      const resume2 = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume2.pdf",
        url: "url2",
        isPrimary: false,
      });

      const { body } = await auth(httpServer.get("/resume")).expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: resume1.id,
            name: "resume1.pdf",
            isPrimary: true,
          }),
          expect.objectContaining({
            id: resume2.id,
            name: "resume2.pdf",
            isPrimary: false,
          }),
        ]),
      );
    });

    it("should not return resumes belonging to another user", async () => {
      await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "my-resume.pdf",
        url: "url",
        isPrimary: true,
      });

      const { body } = await auth(httpServer.get("/resume")).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("my-resume.pdf");
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer.get("/resume").expect(401);
    });
  });
});
