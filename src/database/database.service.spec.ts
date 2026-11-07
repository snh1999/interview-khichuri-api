import { and } from "drizzle-orm";
import {
  boolean,
  PgDialect,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  integer,
  SQLiteSyncDialect,
  sqliteTable,
  text as sqliteText,
} from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { buildConditions } from "./database.service";

const pgJobs = pgTable("jobs", {
  id: uuid("id").defaultRandom(),
  companyId: uuid("company_id"),
  title: text("title").notNull(),
  active: boolean("active").notNull().default(false),
  deadline: timestamp("deadline"),
});

const sqliteJobs = sqliteTable("jobs", {
  id: sqliteText("id"),
  companyId: sqliteText("company_id"),
  title: sqliteText("title"),
  active: integer("active", { mode: "boolean" }),
  deadline: integer("deadline", { mode: "timestamp" }),
});

function pgQuery(columns: Record<string, unknown>) {
  const conditions = buildConditions(pgJobs, columns);
  const where = conditions.length ? and(...conditions) : undefined;
  return where ? new PgDialect().sqlToQuery(where) : { sql: "", params: [] };
}

function sqliteQuery(columns: Record<string, unknown>) {
  const conditions = buildConditions(sqliteJobs, columns);
  const where = conditions.length ? and(...conditions) : undefined;
  return where
    ? new SQLiteSyncDialect().sqlToQuery(where)
    : { sql: "", params: [] };
}

describe.each([
  ["postgres", pgQuery],
  ["sqlite", sqliteQuery],
] as const)("buildConditions (%s)", (_dialect, query) => {
  it("maps null to IS NULL", () => {
    const result = query({ companyId: null });
    expect(result.sql).toMatch(/is null/i);
    expect(result.params).toEqual([]);
  });

  it("maps an array containing null to IS NULL OR IN (...)", () => {
    const result = query({ companyId: ["a", null] });
    expect(result.sql).toMatch(/is null/i);
    expect(result.sql).toMatch(/in \(/i);
    expect(result.params).toEqual(["a"]);
  });

  it("skips undefined values", () => {
    expect(query({ companyId: undefined })).toEqual({ sql: "", params: [] });
  });

  it("maps an array of non-null values to IN (...)", () => {
    const result = query({ companyId: ["a", "b"] });
    expect(result.sql).toMatch(/in \(/i);
    expect(result.sql).not.toMatch(/is null/i);
    expect(result.params).toEqual(["a", "b"]);
  });

  it("maps an array of only nulls to IS NULL", () => {
    const result = query({ companyId: [null, null] });
    expect(result.sql).toMatch(/is null/i);
    expect(result.sql).not.toMatch(/in \(/i);
    expect(result.params).toEqual([]);
  });

  it("keeps an empty array as a single condition", () => {
    expect(buildConditions(pgJobs, { companyId: [] })).toHaveLength(1);
  });

  it("maps a scalar to equality", () => {
    const result = query({ title: "Engineer" });
    expect(result.params).toEqual(["Engineer"]);
  });

  it("rejects unknown columns", () => {
    expect(() => buildConditions(pgJobs, { nope: 1 })).toThrow();
  });
});

describe("buildConditions driver value mapping", () => {
  it("stores SQLite booleans and timestamps as integers", () => {
    const date = new Date("2026-10-25T00:00:00.000Z");
    expect(sqliteQuery({ active: true }).params).toEqual([1]);
    expect(sqliteQuery({ deadline: date }).params).toEqual([
      Math.floor(date.getTime() / 1000),
    ]);
  });

  it("keeps Postgres booleans native and timestamps as ISO strings", () => {
    const date = new Date("2026-10-25T00:00:00.000Z");
    expect(pgQuery({ active: false }).params).toEqual([false]);
    expect(pgQuery({ deadline: date }).params).toEqual([date.toISOString()]);
  });
});
