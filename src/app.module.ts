import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { UtilitiesModule } from "@/src/utilities/utilities.module";

import { BetterAuthModule } from "./better-auth/better-auth.module";
import { CompanyModule } from "./company/company.module";
import { ResponseTransformInterceptor } from "./config/interceptors/response.interceptor";
import { CustomZodValidationPipe } from "./config/pipes/zod.pipe";
import { basicSchema, envSchema } from "./config/utils/env.schema";
import { DatabaseModule } from "./database/database.module";
import { EmailModule } from "./email/email.module";
import { GenAiModule } from "./gen-ai/gen-ai.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { LookupsModule } from "./lookups/lookups.module";
import { PrepSessionModule } from "./prep-session/prep-session.module";
import { ProfileModule } from "./profile/profile.module";
import { ResumeModule } from "./resume/resume.module";

const isApplicationMode = Boolean(process.env.IS_APP_MODE);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      validate: (config) =>
        isApplicationMode ? basicSchema.parse(config) : envSchema.parse(config),
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 60,
        },
      ],
    }),
    DatabaseModule,
    ...(isApplicationMode ? [] : [BetterAuthModule, EmailModule]),
    HealthModule,
    JobsModule,
    LookupsModule,
    PrepSessionModule,
    GenAiModule,
    ProfileModule,
    CompanyModule,
    UtilitiesModule,
    ResumeModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: CustomZodValidationPipe,
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTransformInterceptor,
    },
  ],
})
export class AppModule {}
