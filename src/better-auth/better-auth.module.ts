// eslint-disable-next-line import-x/no-nodejs-modules
import { promises as dns } from 'node:dns';
import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { APIError, betterAuth, User } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ConfigService } from '@nestjs/config';
import { isValid } from 'mailchecker';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { AppConfig } from '../config/utils/env.schema';
import { EmailModule } from '../email/email.module';
import { EmailService } from '../email/email.service';

@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [EmailModule],
      useFactory: (
        db: PostgresJsDatabase,
        config: AppConfig,
        emailService: EmailService,
      ) => ({
        auth: betterAuth({
          database: drizzleAdapter(db, { provider: 'pg' }),
          trustedOrigins: [config.get('FRONTEND_URL')],
          emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            sendResetPassword: async ({ user, url }) => {
              await emailService.sendPasswordResetEmail(user.email, url);
            },
          },
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
              await emailService.sendVerificationEmail(user.email, url);
            },
          },
          socialProviders: {
            google: {
              clientId: config.get('GOOGLE_CLIENT_ID'),
              clientSecret: config.get('GOOGLE_CLIENT_SECRET'),
            },
            github: {
              clientId: config.get('GITHUB_CLIENT_ID'),
              clientSecret: config.get('GITHUB_CLIENT_SECRET'),
            },
            gitlab: {
              clientId: config.get('GITLAB_CLIENT_ID'),
              clientSecret: config.get('GITLAB_CLIENT_SECRET'),
            },
          },
          session: {
            cookieCache: {
              enabled: true,
              maxAge: 5 * 60,
            },
          },
          rateLimit: {
            window: 60 * 10,
            max: 10,
            customRules: {
              '/sign-in/email': { window: 10 * 60, max: 5 },
              '/sign-up/email': { window: 10 * 60, max: 3 },
              '/two-factor/*': { window: 10 * 60, max: 3 },
            },
          },
          advanced: {
            ipAddress: {
              ipAddressHeaders: ['x-forwarded-for', 'cf-connecting-ip'],
            },
          },
          bodyParser: {
            json: { limit: '2mb' },
            urlencoded: { limit: '2mb', extended: true },
            rawBody: true,
          },
          databaseHooks: {
            user: {
              create: {
                before: async (user: User) => {
                  const email = user.email.toLowerCase();
                  if (!isValid(email)) {
                    throw new APIError('BAD_REQUEST', {
                      message:
                        'Disposable or temporary email addresses are not allowed.',
                    });
                  }

                  const domain = email.split('@')[1]?.toLowerCase();
                  try {
                    const records = await dns.resolveMx(domain);
                    if (records.length === 0) {
                      throw new APIError('BAD_REQUEST', {
                        message:
                          'Email domain does not have a valid mail server.',
                      });
                    }
                  } catch (error: unknown) {
                    if (error instanceof APIError) throw error;

                    throw new APIError('BAD_REQUEST', {
                      message: 'Disposable email addresses are not allowed.',
                    });
                  }
                  return { data: { ...user, email } };
                },
              },
            },
          },
        }),
      }),
      inject: [DATABASE_CONNECTION, ConfigService, EmailService],
    }),
  ],
  exports: [AuthModule],
  controllers: [],
})
export class BetterAuthModule {}
