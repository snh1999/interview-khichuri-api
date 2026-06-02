import type { Server } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { vi } from "vitest";

import { AppModule } from "@/src/app.module";
import { IDatabaseService } from "@/src/database/database.types";
import { EmailService } from "@/src/email/email.service";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const bootstrapTestServer = async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue({
      sendVerificationEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendDeleteAccountVerification: vi.fn(),
    })
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
  };
};
