import type { TdbPostgres } from "@/src/database/postgres/postgres.service";
import type { TdbSqlite } from "@/src/database/sqlite/sqlite.service";

export type TReturn<T> = Promise<T> | T;
export type TDatabase = TdbPostgres | TdbSqlite;

export abstract class IDatabaseService {
  public abstract database(): TDatabase;
  public abstract dbPing(): TReturn<void>;
  public abstract dbClear(): TReturn<void>;
}
