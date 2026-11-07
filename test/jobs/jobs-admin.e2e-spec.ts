import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Jobs admin (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    const { appInstance, httpServerInstance, dbServiceInstance } =
      await bootstrapTestServer();
    app = appInstance;
    httpServer = httpServerInstance;
    dbService = dbServiceInstance;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbService.dbClear();
    if (!isAppMode) {
      const user = await getTestAuthHeader(app, dbService.database());
      userCookie = user.cookie;
      const admin = await getTestAuthHeader(app, dbService.database(), {
        role: "admin",
      });
      adminCookie = admin.cookie;
    }
  });

  const asAdmin = (req: supertest.Test): supertest.Test =>
    isAppMode ? req : req.set("Cookie", adminCookie);

  const createSystemJob = async (state: "failed" | "ok" = "failed") => {
    const name = `Acme ${crypto.randomUUID()}`;
    const company = await dbService.create("companies", { name });
    return dbService.create("jobs", {
      userId: null,
      title: "Crawled Engineer",
      companyName: name,
      companyId: company.id,
      url: `https://example.com/jobs/${crypto.randomUUID()}`,
      description: state === "ok" ? "desc" : null,
      provider: "manual",
      state,
      stateChangedAt: new Date("2026-01-01"),
    });
  };

  it("lists failed system jobs only", async () => {
    if (isAppMode) return;
    const failed = await createSystemJob("failed");
    await createSystemJob("ok");

    const { body } = await asAdmin(httpServer.get("/jobs/admin/failed")).expect(
      200,
    );

    const jobs = body.data as { id: string }[];
    expect(jobs.map((job) => job.id)).toEqual([failed.id]);
  });

  it("lists every system job and filters by state", async () => {
    if (isAppMode) return;
    const failed = await createSystemJob("failed");
    const ok = await createSystemJob("ok");

    const { body } = await asAdmin(
      httpServer.get("/jobs/admin?limit=10"),
    ).expect(200);

    const data = body.data as {
      items: { id: string }[];
      total: number;
    };
    expect(data.total).toBe(2);
    expect(data.items.map((job) => job.id).sort()).toEqual(
      [failed.id, ok.id].sort(),
    );

    const filtered = await asAdmin(
      httpServer.get("/jobs/admin?state=failed"),
    ).expect(200);

    const filteredData = filtered.body.data as { items: { id: string }[] };
    expect(filteredData.items.map((job) => job.id)).toEqual([failed.id]);

    const searched = await asAdmin(
      httpServer.get("/jobs/admin?q=Crawled&limit=1"),
    ).expect(200);
    const searchedData = searched.body.data as {
      items: { id: string }[];
      total: number;
    };
    expect(searchedData.items).toHaveLength(1);
    expect(searchedData.total).toBe(2);
  });

  it("retries a failed job by putting it back to none", async () => {
    if (isAppMode) return;
    const job = await createSystemJob("failed");

    const { body } = await asAdmin(
      httpServer.post(`/jobs/admin/${job.id}/retry`),
    ).expect(200);

    expect(body.data.state).toBe("none");
    const stored = await dbService.findById("jobs", job.id);
    expect(stored.state).toBe("none");
    expect(stored.stateChangedAt.getTime()).toBeGreaterThan(
      new Date("2026-01-01").getTime(),
    );
  });

  it("retries every failed system job", async () => {
    if (isAppMode) return;
    const first = await createSystemJob("failed");
    const second = await createSystemJob("failed");

    const { body } = await asAdmin(
      httpServer.post("/jobs/admin/retry-failed"),
    ).expect(200);

    expect(body.data).toEqual({ count: 2 });
    await expect(dbService.findById("jobs", first.id)).resolves.toMatchObject({
      state: "none",
    });
    await expect(dbService.findById("jobs", second.id)).resolves.toMatchObject({
      state: "none",
    });
  });

  it("stores a pasted description and marks the job ok", async () => {
    if (isAppMode) return;
    const job = await createSystemJob("failed");

    const { body } = await asAdmin(
      httpServer
        .post(`/jobs/admin/${job.id}/description`)
        .send({ description: "Pasted description" }),
    ).expect(200);

    expect(body.data).toMatchObject({
      description: "Pasted description",
      state: "ok",
    });
  });

  it("rejects an empty description", async () => {
    if (isAppMode) return;
    const job = await createSystemJob("failed");

    await asAdmin(
      httpServer
        .post(`/jobs/admin/${job.id}/description`)
        .send({ description: "   " }),
    ).expect(400);
  });

  it("returns 404 for a private job", async () => {
    if (isAppMode) return;
    const { body: created } = await httpServer
      .post("/jobs")
      .set("Cookie", userCookie)
      .send({
        title: "Private",
        companyName: "Acme",
        description: "desc",
      })
      .expect(201);

    await asAdmin(
      httpServer.post(`/jobs/admin/${created.data.id}/retry`),
    ).expect(404);
  });

  it("exposes the crawler AI status", async () => {
    if (isAppMode) return;
    const { body } = await asAdmin(
      httpServer.get("/jobs/admin/ai-status"),
    ).expect(200);

    expect(body.data).toMatchObject({
      enabled: expect.any(Boolean),
      pausedUntil: null,
      reason: expect.stringMatching(
        /^(ok|no-admin|no-key|key-rejected|paused)$/,
      ),
    });
    expect(body.data).toHaveProperty("ownerEmail");
    expect(body.data).toHaveProperty("provider");
    expect(body.data).toHaveProperty("model");
  });

  it("returns 403 for non-admin users in web mode", async () => {
    if (isAppMode) return;

    await httpServer
      .get("/jobs/admin/failed")
      .set("Cookie", userCookie)
      .expect(403);
  });

  it("is not registered in app mode", async () => {
    if (!isAppMode) return;

    const id = crypto.randomUUID();
    await httpServer.get("/jobs/admin/failed").expect(404);
    await httpServer.get("/jobs/admin/ai-status").expect(404);
    await httpServer.post(`/jobs/admin/${id}/retry`).expect(404);
    await httpServer
      .post(`/jobs/admin/${id}/description`)
      .send({ description: "desc" })
      .expect(404);
  });
});
