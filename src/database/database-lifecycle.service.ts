import { Injectable, Inject, OnModuleDestroy } from "@nestjs/common";
import BetterSqlite3 from "better-sqlite3";
import { RAW_DATABASE_CLIENT } from "./database.constants";
import type { Sql } from "postgres";

export type TDBRawClient = InstanceType<typeof BetterSqlite3> | Sql;

@Injectable()
export class DatabaseLifecycleService implements OnModuleDestroy {
  public constructor(
    @Inject(RAW_DATABASE_CLIENT)
    private readonly raw: TDBRawClient
  ) {}

  public async onModuleDestroy(): Promise<void> {
    if ("close" in this.raw) {
      this.raw.close();
    } else {
      await (this.raw as Sql).end();
    }
  }
}
