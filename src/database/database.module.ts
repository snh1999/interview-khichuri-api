/* eslint-disable sonarjs/no-wildcard-import */

import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import postgres, { Sql } from "postgres";
import {
  drizzle as pgDrizzle,
  PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import Database from "better-sqlite3";
import {
  drizzle as sqliteDrizzle,
  BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import * as pgSchema from "./postgres/schemas";
import * as sqliteSchema from "./sqlite/schemas";
import { DATABASE_CONNECTION, RAW_DATABASE_CLIENT } from "./database.constants";
import { IDatabaseService } from "./database.types";
import { SqliteService } from "./sqlite/sqlite.service";
import { PostgresService } from "./postgres/postgres.service";
import {
  DatabaseLifecycleService,
  TDBRawClient,
} from "./database-lifecycle.service";

/**
 * The repository pattern (IDatabaseService) handles all feature-level database access.
 * DATABASE_CONNECTION is provided to satisfy better-auth's infrastructure requirement for a raw db reference.
 * as better-auth's drizzleAdapter would require direct access to the Drizzle `db` instance to call internal Drizzle APIs that are not exposed through
 * IDatabaseService. Encapsulating `db` inside PostgresService/SqliteService would make it unreachable to better-auth without an extra getter.
 */
const isApplicationMode = process.env.MODE === "application";
@Global()
@Module({
  providers: [
    {
      provide: RAW_DATABASE_CLIENT,
      useFactory: (config: ConfigService): TDBRawClient => {
        const databaseUrl = config.getOrThrow<string>("DATABASE_URL");
        if (isApplicationMode) {
          return new Database(databaseUrl);
        }
        return postgres(databaseUrl);
      },
      inject: [ConfigService],
    },
    {
      provide: DATABASE_CONNECTION,
      useFactory: (
        raw: TDBRawClient
      ):
        | BetterSQLite3Database<typeof sqliteSchema>
        | PostgresJsDatabase<typeof pgSchema> => {
        if (raw instanceof Database) {
          return sqliteDrizzle({ client: raw, schema: sqliteSchema });
        }
        return pgDrizzle({ client: raw as Sql, schema: pgSchema });
      },
      inject: [RAW_DATABASE_CLIENT],
    },
    {
      provide: IDatabaseService,
      useClass: isApplicationMode ? SqliteService : PostgresService,
    },
    DatabaseLifecycleService,
  ],
  exports: [DATABASE_CONNECTION, IDatabaseService],
})
export class DatabaseModule {}
