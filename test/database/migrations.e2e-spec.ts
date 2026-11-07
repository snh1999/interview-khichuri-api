import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.DATABASE_URL;
const isPostgres = baseUrl?.startsWith("postgresql");
const suite = isPostgres ? describe : describe.skip;
const migrationsDir = join(process.cwd(), "src/database/postgres/migrations");

const migrationSql = (file: string): string =>
  readFileSync(join(migrationsDir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .join(";\n");

const applyMigration = async (db: Sql, file: string): Promise<void> => {
  await db.unsafe(migrationSql(file));
};

suite("Postgres discovery migration", () => {
  let admin: Sql;
  let db: Sql;
  const databaseName = `interview_khichuri_mig_${crypto.randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    if (!baseUrl) throw new Error("missing DATABASE_URL");
    admin = postgres(baseUrl, { max: 1, onnotice: () => true });
    await admin.unsafe(`create database "${databaseName}"`);

    const url = new URL(baseUrl);
    url.pathname = `/${databaseName}`;
    db = postgres(url.toString(), { max: 1, onnotice: () => true });
  });

  afterAll(async () => {
    await db.end();
    await admin.unsafe(
      `drop database if exists "${databaseName}" with (force)`,
    );
    await admin.end();
  });

  it("upgrades existing rows, keeps tracks and cascades a user delete", async () => {
    await applyMigration(db, "0000_quiet_silver_fox.sql");
    await applyMigration(db, "0001_oval_tomorrow_man.sql");

    await db.unsafe(`
      insert into "user" (id, name, email) values ('u1', 'User', 'u1@example.com');
      insert into "jobs"
        (user_id, title, company_name, description, source, status, is_favorite, notes)
      values
        ('u1', 'Old job', 'Acme', 'Body', 'https://acme.test/jobs/1', 'saved', true, 'note');
    `);

    await applyMigration(db, "0002_job_discovery.sql");

    const [job] = await db<
      { state: string; provider: string; url: string; description: string }[]
    >`select state, provider, url, description from jobs`;
    expect(job).toMatchObject({
      state: "ok",
      provider: "manual",
      url: "https://acme.test/jobs/1",
      description: "Body",
    });

    const tracks = await db<
      { user_id: string; status: string; is_favorite: boolean; notes: string }[]
    >`select user_id, status, is_favorite, notes from tracked_jobs`;
    expect(tracks).toEqual([
      {
        user_id: "u1",
        status: "saved",
        is_favorite: true,
        notes: "note",
      },
    ]);

    await db`delete from "user" where id = 'u1'`;
    const [counts] = await db<{ jobs: number; tracks: number }[]>`
      select
        (select count(*)::int from jobs) as jobs,
        (select count(*)::int from tracked_jobs) as tracks
    `;
    expect(counts).toEqual({ jobs: 0, tracks: 0 });
  });

  it("rejects duplicate system identities and ok jobs without a description", async () => {
    const [company] = await db<{ id: number }[]>`
      insert into companies (name) values (${`Acme ${crypto.randomUUID()}`})
      returning id
    `;
    const insertJob = () => db`
      insert into jobs
        (user_id, title, company_name, company_id, description, url, provider, state)
      values
        (null, 'Crawled', 'Acme', ${company.id}, ${"Body"}, ${"https://acme.test/jobs/2"}, 'greenhouse', 'ok')
    `;

    await insertJob();
    await expect(insertJob()).rejects.toThrow();
    await expect(
      db`
        insert into jobs
          (user_id, title, company_name, company_id, description, url, provider, state)
        values
          (null, 'No body', 'Acme', ${company.id}, ${null}, ${"https://acme.test/jobs/3"}, 'greenhouse', 'ok')
      `,
    ).rejects.toThrow();
  });
});
