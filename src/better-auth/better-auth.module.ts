import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DATABASE_CONNECTION } from '../database/database.constants';

@Module({
  imports: [
    AuthModule.forRootAsync({
      useFactory: (database: PostgresJsDatabase) => ({
        auth: betterAuth({
          database: drizzleAdapter(database, { provider: 'pg' }),
          emailAndPassword: { enabled: true },
        }),
      }),
      inject: [DATABASE_CONNECTION],
    }),
  ],
  exports: [AuthModule],
})
export class BetterAuthModule {}
