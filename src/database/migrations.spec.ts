import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  jobs as pgJobs,
  tracked_jobs as pgTrackedJobs,
} from "@/src/database/postgres/schemas";
import {
  jobs as sqliteJobs,
  tracked_jobs as sqliteTrackedJobs,
} from "@/src/database/sqlite/schemas";

describe("dialect schema parity", () => {
  it("keeps the user FKs only in Postgres", () => {
    const pgJobFk = getPgTableConfig(pgJobs).foreignKeys.find(
      (fk) => fk.reference().columns[0].name === "user_id",
    );
    const pgTrackFk = getPgTableConfig(pgTrackedJobs).foreignKeys.find(
      (fk) => fk.reference().columns[0].name === "user_id",
    );
    const sqliteJobFk = getSqliteTableConfig(sqliteJobs).foreignKeys.find(
      (fk) => fk.reference().columns[0].name === "user_id",
    );
    const sqliteTrackFk = getSqliteTableConfig(
      sqliteTrackedJobs,
    ).foreignKeys.find((fk) => fk.reference().columns[0].name === "user_id");

    expect(pgJobFk?.onDelete).toBe("cascade");
    expect(pgTrackFk?.onDelete).toBe("cascade");
    expect(sqliteJobFk).toBeUndefined();
    expect(sqliteTrackFk).toBeUndefined();
  });
});
