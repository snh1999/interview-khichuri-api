import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { DatabaseModule } from './database/database.module';
import { envSchema } from './config/utils/env.schema';
import { CustomZodValidationPipe } from './config/pipes/zod.pipe';
import { BetterAuthModule } from './better-auth/better-auth.module';
import { ApplicationGuard } from './config/guards/application.guard';
import { HealthModule } from './health/health.module';
import { ResponseTransformInterceptor } from './config/interceptors/response.interceptor';

const isApplicationMode = process.env.MODE === 'application';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      validate: (config) => envSchema.parse(config),
    }),
    DatabaseModule,
    ...(isApplicationMode ? [] : [BetterAuthModule]),
    HealthModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: CustomZodValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: isApplicationMode ? ApplicationGuard : AuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTransformInterceptor,
    },
  ],
})
export class AppModule {}
