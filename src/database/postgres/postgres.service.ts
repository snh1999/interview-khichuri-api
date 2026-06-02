import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { DATABASE_CONNECTION } from "../database.constants";
import { IDatabaseService } from "../database.types";
import * as schema from "./schemas";

export type TdbPostgres = PostgresJsDatabase<typeof schema>;

@Injectable()
// eslint-disable-next-line @darraghor/nestjs-typed/injectable-should-be-provided
export class PostgresService implements IDatabaseService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: TdbPostgres,
  ) {}

  public database(): TdbPostgres {
    return this.db;
  }

  public async dbPing(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }

  public async dbClear(): Promise<void> {
    const allowedModes = ["development", "test", "local"];
    if (!allowedModes.includes(process.env.NODE_ENV ?? "")) {
      throw new BadRequestException("Can not delete production data");
    }

    const tableNames = (Object.values(schema) as unknown[])
      .filter((table): table is PgTable => is(table, PgTable))
      .map((table) => getTableName(table));

    for (const table of tableNames) {
      await this.db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
    }
  }
}
