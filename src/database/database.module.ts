/* eslint-disable sonarjs/no-wildcard-import */

import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import postgres from "postgres";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import Database from "better-sqlite3";
import { drizzle as sqliteDrizzle } from "drizzle-orm/better-sqlite3";
import * as pgSchema from "./postgres/schemas";
import * as sqliteSchema from "./sqlite/schemas";
import { DATABASE_CONNECTION } from "./database.constants";
import { IDatabaseService } from "./database.types";
import { SqliteService } from "./sqlite/sqlite.service";
import { PostgresService } from "./postgres/postgres.service";

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
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.getOrThrow<string>("DATABASE_URL");

        if (isApplicationMode) {
          const sqlite = new Database("sqlite.db");
          return sqliteDrizzle({ client: sqlite, schema: sqliteSchema });
        }

        const queryClient = postgres(databaseUrl);
        return pgDrizzle({ client: queryClient, schema: pgSchema });
      },
      inject: [ConfigService],
    },
    {
      provide: IDatabaseService,
      useClass: isApplicationMode ? SqliteService : PostgresService,
    },
  ],
  exports: [DATABASE_CONNECTION, IDatabaseService],
})
export class DatabaseModule {}
