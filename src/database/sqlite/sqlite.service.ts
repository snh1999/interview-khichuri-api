import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getTableName, is, sql } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

import { TBasicSchema } from "@/src/config/utils/env.schema";

import { DATABASE_CONNECTION } from "../database.constants";
import { IDatabaseService } from "../database.types";
import * as schema from "./schemas";

export type TdbSqlite = BetterSQLite3Database<typeof schema>;

@Injectable()
// eslint-disable-next-line @darraghor/nestjs-typed/injectable-should-be-provided
export class SqliteService implements IDatabaseService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: TdbSqlite,
    private readonly config: ConfigService<TBasicSchema, true>,
  ) {}

  public database(): TdbSqlite {
    return this.db;
  }

  public dbPing(): void {
    this.db.run(sql`SELECT 1`);
  }

  public dbClear(): void {
    const allowedModes = ["development", "test", "local"];
    if (!allowedModes.includes(this.config.get("NODE_ENV"))) {
      throw new BadRequestException("Cannot delete production data");
    }

    const tableNames = Object.values(schema)
      .filter((table): table is SQLiteTable => is(table, SQLiteTable))
      .map((table) => getTableName(table));

    for (const table of tableNames) {
      this.db.run(sql.raw(`DELETE FROM "${table}"`));
    }
  }
}
