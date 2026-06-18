import type { Server } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type supertest from "supertest";
import request from "supertest";
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
import { EmailService } from "@/src/email/email.service";
import { FileUploadService } from "@/src/utilities/upload/file-upload.service";

import { getTestAuthHeader } from "../utils/auth-helpers";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Upload Resume (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof request>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let testUserId: string | undefined;

  const mockFileUploadService = {
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    getSignedUrl: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FileUploadService)
      .useValue(mockFileUploadService)
      .overrideProvider(EmailService)
      .useValue({
        sendVerificationEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendDeleteAccountVerification: vi.fn(),
      })
      .compile();

    app = module.createNestApplication();
    httpServer = request(app.getHttpServer() as Server);
    dbService = app.get(IDatabaseService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await dbService.dbClear();
    if (!isAppMode) {
      const { cookie, userId } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      authCookie = cookie;
      testUserId = userId;
      await dbService.create("profiles", {
        id: userId,
        firstName: "",
        lastName: "",
      });
    } else {
      testUserId = "app";
      await dbService.create("profiles", {
        id: "app",
        firstName: "",
        lastName: "",
      });
    }
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

    it("should return 404 when resume does not exist", async () => {
      await auth(
        httpServer.delete("/resume/00000000-0000-0000-0000-000000000000"),
      ).expect(404);
    });
  });
});
