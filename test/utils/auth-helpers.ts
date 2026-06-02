import { createHmac, randomBytes } from "node:crypto";

import { faker } from "@faker-js/faker/locale/en";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { is } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";

import type { TDatabase } from "@/src/database/database.types";
import type { TdbPostgres } from "@/src/database/postgres/postgres.service";
import { account, session, user } from "@/src/database/postgres/schemas";

interface CreateTestUserOptions {
  email?: string;
  name?: string;
  role?: "user" | "admin";
}

export interface AuthSession {
  cookie: string;
  token: string;
  userId: string;
}

export async function getTestAuthHeader(
  app: INestApplication,
  db: TDatabase,
  options: CreateTestUserOptions = {},
): Promise<string> {
  const config = app.get<ConfigService>(ConfigService);

  if (is(db, PgDatabase)) {
    const { cookie } = await createTestUser(db as TdbPostgres, config, options);
    return cookie;
  }
  return "";
}

export async function createTestUser(
  db: TdbPostgres,
  config: ConfigService,
  options: CreateTestUserOptions = {},
): Promise<AuthSession> {
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const token = randomBytes(32).toString("hex");

  const secret = config.getOrThrow<string>("BETTER_AUTH_SECRET");
  const hmac = createHmac("sha256", secret);
  hmac.update(token);
  const signedToken = `${token}.${hmac.digest("base64")}`;
  const accountId = crypto.randomUUID();

  const email = options.email ?? faker.internet.email();
  const name = options.name ?? faker.internet.username();
  const role = options.role ?? "user";

  await db.insert(user).values({
    email,
    name,
    role,
    id: userId,
    emailVerified: true,
  });

  await db.insert(account).values({
    id: accountId,
    accountId: userId,
    providerId: "credential",
    userId,
    password: faker.internet.password(),
  });

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await db.insert(session).values({
    id: sessionId,
    token,
    userId,
    expiresAt,
    userAgent: "vitest",
  });

  return {
    cookie: `better-auth.session_token=${signedToken}`,
    token,
    userId,
  };
}
