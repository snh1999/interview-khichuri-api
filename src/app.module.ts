import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { envSchema } from './config/utils/env.schema';
import { CustomZodValidationPipe } from './config/pipes/zod.pipe';
import { BetterAuthModule } from './better-auth/better-auth.module';
import { HealthModule } from './health/health.module';
import { ResponseTransformInterceptor } from './config/interceptors/response.interceptor';
import { EmailModule } from './email/email.module';

const isApplicationMode = process.env.MODE === 'application';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      validate: (config) => envSchema.parse(config),
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
    ...(isApplicationMode ? [] : [BetterAuthModule]),
    HealthModule,
    EmailModule,
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
