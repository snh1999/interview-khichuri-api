import { promises as dns } from "node:dns";

import { passkey } from "@better-auth/passkey";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { APIError, betterAuth, User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { lastLoginMethod } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { twoFactor } from "better-auth/plugins/two-factor";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { isValid } from "mailchecker";

import { checkPasswordCompromise } from "@/src/better-auth/better-auth.helper";

import { TEnvSchema } from "../config/utils/env.schema";
import { DATABASE_CONNECTION } from "../database/database.constants";
import { EmailModule } from "../email/email.module";
import { EmailService } from "../email/email.service";

@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [EmailModule],
      useFactory: (
        db: PostgresJsDatabase,
        config: ConfigService<TEnvSchema, true>,
        emailService: EmailService,
      ) => ({
        auth: betterAuth({
          appName: "Interview Khichuri",
          database: drizzleAdapter(db, { provider: "pg" }),
          trustedOrigins: [config.get("FRONTEND_URL")],
          plugins: [
            admin(),
            lastLoginMethod(),
            haveIBeenPwned({
              paths: [
                "/sign-up/email",
                "/change-password",
                "/admin/create-user",
                "/admin/set-user-password",
              ],
            }),
            // TODO: add a cron job to purge abandoned 2FA setup rows
            // (two_factor with verified = false) older than a TTL.
            twoFactor(),
            passkey({
              // rpID must be the domain the *frontend* is served from, not the
              // API's own host — the plugin's default derivation from baseURL
              // yields `onrender.com` here, which WebAuthn rejects since it is
              // not a suffix of the calling origin's domain.
              //
              // Using the full hostname rather than trimming to the registrable
              // domain is deliberate: trimming needs the Public Suffix List, and
              // a naive "drop the first label" split produces a public suffix
              // for common hosts (`vercel.app`, `github.io`, `co.uk`), which
              // would either be rejected or widen passkey scope to other sites
              // on that suffix. `hostname` also drops any port, so dev works
              // unchanged — FRONTEND_URL is `http://localhost:3000` there, and
              // `localhost` is the correct rpID for a non-secure context.
              rpID: new URL(config.get<string>("FRONTEND_URL")).hostname,
              rpName: "Interview Khichuri",
              origin: config.get<string>("FRONTEND_URL"),
            }),
          ],
          account: {
            accountLinking: {
              enabled: true,
              allowDifferentEmails: true,
            },
          },
          user: {
            deleteUser: {
              enabled: true,
              sendDeleteAccountVerification: async ({ user, url }) =>
                emailService.sendDeleteAccountVerification(user.email, url),
            },
          },
          emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            // onExistingUserSignUp: ()=>{} // add a notification/email for user
            sendResetPassword: async ({ user, token }) => {
              const url = `${config.get<string>("FRONTEND_URL")}/reset-password?token=${token}`;
              await emailService.sendPasswordResetEmail(user.email, url);
            },
            customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
              ...coreFields,
              role: "user",
              banned: false,
              banReason: null,
              banExpires: null,
              ...additionalFields,
              id,
            }),
          },
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, token }) => {
              const url = `${config.get<string>("FRONTEND_URL")}/verify-email?token=${token}`;
              await emailService.sendVerificationEmail(user.email, url);
            },
          },
          socialProviders: {
            google: {
              clientId: config.get("GOOGLE_CLIENT_ID"),
              clientSecret: config.get("GOOGLE_CLIENT_SECRET"),
            },
            github: {
              clientId: config.get("GITHUB_CLIENT_ID"),
              clientSecret: config.get("GITHUB_CLIENT_SECRET"),
            },
            gitlab: {
              clientId: config.get("GITLAB_CLIENT_ID"),
              clientSecret: config.get("GITLAB_CLIENT_SECRET"),
            },
          },
          session: {
            cookieCache: {
              enabled: true,
              maxAge: 5 * 60,
            },
            // matches session expiry
            freshAge: 3600 * 24 * 30,
            expiresIn: 3600 * 24 * 30,
          },
          rateLimit: {
            window: 60 * 10,
            max: 10,
            customRules: {
              "/sign-in/email": { window: 10 * 60, max: 5 },
              "/sign-up/email": { window: 10 * 60, max: 3 },
              "/two-factor/*": { window: 10 * 60, max: 3 },
            },
          },
          advanced: {
            ipAddress: {
              ipAddressHeaders: ["x-forwarded-for", "cf-connecting-ip"],
            },
            // The frontend and API are different sites, so the default Lax cookie is
            // never sent on cross-site fetch. None + Secure is required in production;
            // gated on NODE_ENV because Safari rejects Secure cookies on http://localhost.
            defaultCookieAttributes:
              config.get("NODE_ENV") === "production"
                ? { sameSite: "none", secure: true }
                : {},
          },
          bodyParser: {
            json: { limit: "2mb" },
            urlencoded: { limit: "2mb", extended: true },
            rawBody: true,
          },
          hooks: {
            // Check password BEFORE the endpoint runs (token not yet consumed)
            before: createAuthMiddleware(async (ctx) => {
              if (ctx.path === "/reset-password") {
                const body = ctx.body as Record<string, unknown> | undefined;
                const newPassword = body?.newPassword;
                if (typeof newPassword !== "string") {
                  throw new APIError("BAD_REQUEST", {
                    message: "newPassword is required",
                  });
                }
                await checkPasswordCompromise(newPassword);
              }
            }),
          },
          databaseHooks: {
            user: {
              create: {
                before: async (user: User) => {
                  const email = user.email.toLowerCase();
                  if (!isValid(email)) {
                    throw new APIError("BAD_REQUEST", {
                      message:
                        "Disposable or temporary email addresses are not allowed.",
                    });
                  }

                  const domain = email.split("@")[1]?.toLowerCase();
                  try {
                    const records = await dns.resolveMx(domain);
                    if (records.length === 0) {
                      throw new APIError("BAD_REQUEST", {
                        message:
                          "Email domain does not have a valid mail server.",
                      });
                    }
                  } catch (error: unknown) {
                    if (error instanceof APIError) throw error;
                    throw new APIError("BAD_REQUEST", {
                      message: "Disposable email addresses are not allowed.",
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
