import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DATABASE_CONNECTION } from "@/src/database/database.constants";
import type { IDatabaseService } from "@/src/database/database.service";
import type { TPromptInsert } from "@/src/database/database.types";
import type { TdbPostgres } from "@/src/database/postgres/postgres.service";
import { user } from "@/src/database/postgres/schemas";

import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe.skipIf(isAppMode)("Admin dashboard (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let pg: TdbPostgres;
  let userCookie: string;
  let userId: string;
  let adminCookie: string;
  let adminId: string;

  beforeAll(async () => {
    const { appInstance, httpServerInstance, dbServiceInstance } =
      await bootstrapTestServer();
    app = appInstance;
    httpServer = httpServerInstance;
    dbService = dbServiceInstance;
    pg = app.get<TdbPostgres>(DATABASE_CONNECTION);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbService.dbClear();
    const normal = await getTestAuthHeader(app, dbService.database());
    userCookie = normal.cookie;
    userId = normal.userId ?? "";
    const admin = await getTestAuthHeader(app, dbService.database(), {
      role: "admin",
    });
    adminCookie = admin.cookie;
    adminId = admin.userId ?? "";
  });

  const get = (path: string, cookie = adminCookie): supertest.Test =>
    httpServer.get(path).set("Cookie", cookie);

  const createPrompt = (
    ownerId: string,
    overrides: Partial<TPromptInsert> = {},
  ) =>
    dbService.create("prompts", {
      userId: ownerId,
      title: "Alpha prompt",
      prompt: "A reusable prompt body",
      type: "general",
      isPublic: false,
      ...overrides,
    });

  describe("GET /admin/stats", () => {
    it("rejects a non-admin user", async () => {
      await get("/admin/stats", userCookie).expect(403);
    });

    it("returns aggregate user, usage and signup stats", async () => {
      const { body } = await get("/admin/stats").expect(200);

      expect(body.data.users).toMatchObject({
        total: 2,
        verified: 2,
        banned: 0,
        activeSessions: 2,
      });
      const usage = body.data.usage as Record<string, number>;
      expect(Object.keys(usage)).toEqual([
        "jobs",
        "prepSessions",
        "interviews",
        "resumes",
        "notes",
        "prompts",
        "apiKeys",
        "companies",
        "calendarEvents",
      ]);
      expect(body.data.signups).toHaveLength(30);
    });
  });

  describe("GET /admin/users", () => {
    it("rejects a non-admin user", async () => {
      await get("/admin/users", userCookie).expect(403);
    });

    it("lists users with server-side pagination", async () => {
      const { body } = await get(
        "/admin/users?page=1&limit=1&sort=name:asc",
      ).expect(200);

      expect(body.data.total).toBe(2);
      expect(body.data.users).toHaveLength(1);
    });

    it("searches name/email and combines role, banned and verified filters", async () => {
      const alice = await getTestAuthHeader(app, dbService.database(), {
        email: "alice@example.com",
        name: "Alice",
      });
      await pg
        .update(user)
        .set({ banned: true, emailVerified: false })
        .where(eq(user.id, alice.userId ?? ""));

      const search = await get("/admin/users?q=alice").expect(200);
      expect(search.body.data.total).toBe(1);
      expect(search.body.data.users[0].email).toBe("alice@example.com");

      const admins = await get("/admin/users?role=admin").expect(200);
      expect(admins.body.data.total).toBe(1);
      expect(admins.body.data.users[0].id).toBe(adminId);

      const banned = await get("/admin/users?banned=true").expect(200);
      expect(banned.body.data.total).toBe(1);
      expect(banned.body.data.users[0].id).toBe(alice.userId);

      const unverified = await get("/admin/users?verified=false").expect(200);
      expect(unverified.body.data.total).toBe(1);
      expect(unverified.body.data.users[0].id).toBe(alice.userId);

      const combined = await get(
        "/admin/users?q=alice&banned=true&verified=false",
      ).expect(200);
      expect(combined.body.data.total).toBe(1);
    });

    it("returns a user detail with activity counts", async () => {
      await createPrompt(userId);

      const { body } = await get(`/admin/users/${userId}`).expect(200);

      expect(body.data.user.id).toBe(userId);
      expect(body.data.counts.prompts).toBe(1);
      expect(body.data.providers).toContain("credential");
      expect(body.data.passkeys).toBe(0);
    });

    it("returns 404 for an unknown user", async () => {
      await get("/admin/users/does-not-exist").expect(404);
    });
  });

  describe("GET /prompts/admin", () => {
    it("rejects a non-admin user", async () => {
      await get("/prompts/admin", userCookie).expect(403);
    });

    it("lists prompts from every user and scope with a total", async () => {
      await createPrompt(userId, { title: "Private mine" });
      await createPrompt(adminId, { title: "Private admin" });
      await createPrompt(adminId, { title: "Public admin", isPublic: true });

      const { body } = await get("/prompts/admin").expect(200);

      expect(body.data.total).toBe(3);
      expect(body.data.prompts).toHaveLength(3);
    });

    it("searches title/prompt and paginates while keeping the total", async () => {
      await createPrompt(userId, { title: "Alpha" });
      await createPrompt(userId, { title: "Beta" });
      await createPrompt(userId, { title: "Gamma" });

      const search = await get("/prompts/admin?search=alpha").expect(200);
      expect(search.body.data.total).toBe(1);
      expect(search.body.data.prompts[0].title).toBe("Alpha");

      const page = await get(
        "/prompts/admin?page=2&limit=1&sort=title:asc",
      ).expect(200);
      expect(page.body.data.total).toBe(3);
      expect(page.body.data.prompts).toHaveLength(1);
      expect(page.body.data.prompts[0].title).toBe("Beta");
    });

    it("rejects a sort column outside the allowlist", async () => {
      await get("/prompts/admin?sort=prompt:asc").expect(400);
    });
  });
});
