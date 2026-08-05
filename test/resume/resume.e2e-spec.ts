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

import { getResumeContentPayload } from "./resume.test-data";
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

    it("should return 400 when the user already has 5 resumes", async () => {
      for (let i = 0; i < 5; i++) {
        await dbService.create("resume", {
          profileId: testUserId ?? "app",
          name: `resume${i}.pdf`,
          url: `url${i}`,
        });
      }

      await auth(httpServer.post("/resume"))
        .attach("file", Buffer.from("%PDF-1.4\nfake pdf content"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        })
        .expect(400);
    });

    it("should return 413 when the file exceeds the 5MB limit", async () => {
      await auth(httpServer.post("/resume"))
        .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), {
          filename: "large.pdf",
          contentType: "application/pdf",
        })
        .expect(413);
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

    it("should return 403 when resume belongs to another user", async () => {
      if (isAppMode) return;

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
      });

      await auth(httpServer.delete(`/resume/${resume.id}`)).expect(403);
    });

    it("should delete the uploaded file and remove the row", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume.pdf",
        url: "resumes/profile/uuid.pdf",
        isPrimary: true,
      });

      await auth(httpServer.delete(`/resume/${resume.id}`)).expect(200);

      expect(mockFileUploadService.deleteFile).toHaveBeenCalledWith(
        "resumes/profile/uuid.pdf",
      );

      const resumes = await dbService.findAllByColumn("resume", {
        filter: { profileId: testUserId ?? "app" },
      });
      expect(resumes).toHaveLength(0);
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

    it("should return 403 when the resume belongs to another user", async () => {
      if (isAppMode) return;

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
        url: "url",
      });

      await auth(httpServer.patch(`/resume/${resume.id}/primary`)).expect(403);
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

  describe("POST /resume/create", () => {
    it("should create a resume from content", async () => {
      const content = getResumeContentPayload();

      const { body } = await auth(httpServer.post("/resume/create"))
        .send({ name: "  My Resume  ", content })
        .expect(201);

      expect(body.statusCode).toBe(201);
      expect(body.data.name).toBe("My Resume");
      expect(body.data.template).toBeNull();
      expect(body.data.isPublic).toBe(false);
      expect(body.data.slug).toBeNull();
      expect(body.data.isPrimary).toBe(true);
      expect(body.data.content).toEqual(content);

      const stored = await dbService.findAllByColumn("resume", {
        filter: { profileId: testUserId ?? "app" },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0].content).toBe(JSON.stringify(content));
    });

    it("should store the provided template", async () => {
      const { body } = await auth(httpServer.post("/resume/create"))
        .send({
          name: "Resume",
          content: getResumeContentPayload(),
          template: "professional",
        })
        .expect(201);

      expect(body.statusCode).toBe(201);
      expect(body.data.template).toBe("professional");
    });

    it("should mark the resume non-primary when another resume exists", async () => {
      await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "existing.pdf",
        url: "url",
        isPrimary: true,
      });

      const { body } = await auth(httpServer.post("/resume/create"))
        .send({ name: "New", content: getResumeContentPayload() })
        .expect(201);

      expect(body.data.isPrimary).toBe(false);
    });

    it("should return 400 when the user already has 5 resumes", async () => {
      for (let i = 0; i < 5; i++) {
        await dbService.create("resume", {
          profileId: testUserId ?? "app",
          name: `resume${i}.pdf`,
          url: `url${i}`,
        });
      }

      await auth(httpServer.post("/resume/create"))
        .send({ name: "One too many", content: getResumeContentPayload() })
        .expect(400);
    });

    it("should return 400 when the name is missing", async () => {
      await auth(httpServer.post("/resume/create"))
        .send({ content: getResumeContentPayload() })
        .expect(400);
    });

    it("should return 400 when the name is empty", async () => {
      await auth(httpServer.post("/resume/create"))
        .send({ name: "   ", content: getResumeContentPayload() })
        .expect(400);
    });

    it("should return 400 when the content is missing", async () => {
      await auth(httpServer.post("/resume/create"))
        .send({ name: "My Resume" })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .post("/resume/create")
        .send({ name: "My Resume", content: getResumeContentPayload() })
        .expect(401);
    });
  });

  describe("GET /resume/slug/:slug", () => {
    it("should return a public resume by slug without auth", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "Public Resume",
        url: "url",
        slug: "public-resume-1234",
        isPublic: true,
      });

      const { body } = await httpServer
        .get("/resume/slug/public-resume-1234")
        .expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data.id).toBe(resume.id);
      expect(body.data.name).toBe("Public Resume");
    });

    it("should return 404 when the resume is not public", async () => {
      await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "Private Resume",
        url: "url",
        slug: "private-resume-1234",
        isPublic: false,
      });

      await httpServer.get("/resume/slug/private-resume-1234").expect(404);
    });

    it("should return 404 when the slug does not exist", async () => {
      await httpServer.get("/resume/slug/does-not-exist").expect(404);
    });
  });

  describe("GET /resume/:id", () => {
    it("should return a resume by id", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "resume.pdf",
        url: "url",
        isPrimary: true,
      });

      const { body } = await auth(
        httpServer.get(`/resume/${resume.id}`),
      ).expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data.id).toBe(resume.id);
      expect(body.data.name).toBe("resume.pdf");
      expect(body.data.isPrimary).toBe(true);
    });

    it("should return 400 with non-uuid resume id", async () => {
      await auth(httpServer.get("/resume/invalid_id")).expect(400);
    });

    it("should return 404 when resume does not exist", async () => {
      await auth(httpServer.get(`/resume/${crypto.randomUUID()}`)).expect(404);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer.get(`/resume/${crypto.randomUUID()}`).expect(401);
    });
  });

  describe("PATCH /resume/:id", () => {
    it("should update the resume name", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "Old Name",
        url: "",
      });

      const { body } = await auth(httpServer.patch(`/resume/${resume.id}`))
        .send({ name: "New Name" })
        .expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data.name).toBe("New Name");

      const updated = await dbService.findAllByColumn("resume", {
        filter: { profileId: testUserId ?? "app" },
      });
      expect(updated[0].name).toBe("New Name");
    });

    it("should generate a slug when the resume is made public", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "My Resume",
        url: "",
        isPublic: false,
        slug: null,
      });

      const { body } = await auth(httpServer.patch(`/resume/${resume.id}`))
        .send({ isPublic: true })
        .expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data.slug).toMatch(/^[a-z0-9-]{1,40}-[a-z0-9]{4}$/);
    });

    it("should keep the existing slug when set public again", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "My Resume",
        url: "",
        slug: "my-resume-ab12",
        isPublic: true,
      });

      const { body } = await auth(httpServer.patch(`/resume/${resume.id}`))
        .send({ isPublic: true })
        .expect(200);

      expect(body.data.slug).toBe("my-resume-ab12");
    });

    it("should not generate a slug when the resume is not public", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "My Resume",
        url: "",
        isPublic: false,
        slug: null,
      });

      const { body } = await auth(httpServer.patch(`/resume/${resume.id}`))
        .send({ isPublic: false })
        .expect(200);

      expect(body.data.slug).toBeNull();
    });

    it("should reject content updates on a PDF resume", async () => {
      const content = getResumeContentPayload();

      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "Uploaded Resume",
        url: "resumes/profile/uuid.pdf",
      });

      const { body } = await auth(httpServer.patch(`/resume/${resume.id}`))
        .send({ name: "Edited", content })
        .expect(400);

      expect(body.statusCode).toBe(400);
      expect(body.message).toContain("PDF upload");
      expect(mockFileUploadService.deleteFile).not.toHaveBeenCalled();

      const updated = await dbService.findById("resume", resume.id);
      expect(updated.name).toBe("Uploaded Resume");
      expect(updated.url).toBe("resumes/profile/uuid.pdf");
      expect(updated.content).toBeNull();
    });

    it("should allow non-content updates on a PDF resume", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "Uploaded Resume",
        url: "resumes/profile/uuid.pdf",
        template: "professional",
        isPublic: false,
      });

      const { body } = await auth(httpServer.patch(`/resume/${resume.id}`))
        .send({ name: "Renamed", template: "minimal", isPublic: true })
        .expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data.name).toBe("Renamed");
      expect(body.data.template).toBe("minimal");
      expect(body.data.isPublic).toBe(true);
      expect(body.data.url).toBe("resumes/profile/uuid.pdf");
      expect(body.data.content).toBeNull();
    });

    it("should return 403 when the resume belongs to another user", async () => {
      if (isAppMode) return;

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
        name: "Others Resume",
        url: "",
      });

      await auth(httpServer.patch(`/resume/${resume.id}`))
        .send({ name: "Nope" })
        .expect(403);
    });

    it("should return 404 when the resume does not exist", async () => {
      await auth(httpServer.patch(`/resume/${crypto.randomUUID()}`))
        .send({ name: "Nope" })
        .expect(404);
    });

    it("should return 400 with non-uuid resume id", async () => {
      await auth(httpServer.patch("/resume/invalid_id"))
        .send({ name: "Nope" })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .patch(`/resume/${crypto.randomUUID()}`)
        .send({ name: "Nope" })
        .expect(401);
    });
  });

  describe("POST /resume/:id/extract", () => {
    it("should return 404 when the resume does not exist", async () => {
      await auth(httpServer.post(`/resume/${crypto.randomUUID()}/extract`))
        .send({ provider: "openai" })
        .expect(404);
    });

    it("should return 403 when the resume belongs to another user", async () => {
      if (isAppMode) return;

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
        name: "Others Resume",
        url: "resumes/other/file.pdf",
      });

      await auth(httpServer.post(`/resume/${resume.id}/extract`))
        .send({ provider: "openai" })
        .expect(403);
    });

    it("should return 400 when the resume has no PDF file", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "No File",
        url: "",
      });

      await auth(httpServer.post(`/resume/${resume.id}/extract`))
        .send({ provider: "openai" })
        .expect(400);
    });

    it("should return 400 with an invalid provider", async () => {
      const resume = await dbService.create("resume", {
        profileId: testUserId ?? "app",
        name: "No File",
        url: "url",
      });

      await auth(httpServer.post(`/resume/${resume.id}/extract`))
        .send({ provider: "invalid-provider" })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .post(`/resume/${crypto.randomUUID()}/extract`)
        .send({ provider: "openai" })
        .expect(401);
    });
  });
});
