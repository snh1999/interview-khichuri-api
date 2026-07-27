import type { Server } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { ThrottlerModuleOptions } from "@nestjs/throttler";
import { THROTTLER_OPTIONS } from "@nestjs/throttler/dist/throttler.constants";
import request from "supertest";
import { type MockedFunction, vi } from "vitest";

import { AppModule } from "@/src/app.module";
import { IDatabaseService } from "@/src/database/database.service";
import { EmailService } from "@/src/email/email.service";
import { FileUploadService } from "@/src/utilities/upload/file-upload.service";

export interface TMockFileUploadService {
  uploadFile: MockedFunction<
    (typeof FileUploadService.prototype)["uploadFile"]
  >;
  deleteFile: MockedFunction<
    (typeof FileUploadService.prototype)["deleteFile"]
  >;
  getSignedUrl: MockedFunction<
    (typeof FileUploadService.prototype)["getSignedUrl"]
  >;
}

const mockFileUploadService: TMockFileUploadService = {
  uploadFile: vi
    .fn()
    .mockResolvedValue({ success: true, filename: "test-file.pdf" }),
  deleteFile: vi.fn(),
  getSignedUrl: vi.fn(),
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const bootstrapTestServer = async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue({
      sendVerificationEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendDeleteAccountVerification: vi.fn(),
    })
    .overrideProvider(THROTTLER_OPTIONS)
    .useValue([{ ttl: 60_000, limit: 9_999 }] as ThrottlerModuleOptions)
    .overrideProvider(FileUploadService)
    .useValue(mockFileUploadService)
    .compile();

  const app: INestApplication = module.createNestApplication();
  const httpServer = app.getHttpServer();
  await app.init();

  const databaseService = app.get<IDatabaseService>(IDatabaseService);
  const configService = app.get<ConfigService>(ConfigService);

  return {
    appInstance: app,
    httpServerInstance: request(httpServer as Server),
    dbServiceInstance: databaseService,
    config: configService,
    mockFileUploadService,
  };
};
