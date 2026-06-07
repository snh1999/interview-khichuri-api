import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type {
  TdbPostgres,
  TpgCols,
  TpgTableKey,
  TpgTableRegistry,
} from "@/src/database/postgres/postgres.service";
import type { jobSchema, roleSchema } from "@/src/database/postgres/schemas";
import type {
  TdbSqlite,
  TSqliteCols,
  TsqliteTableRegistry,
} from "@/src/database/sqlite/sqlite.service";

export type TReturn<T> = Promise<T> | T;
export type TDatabase = TdbPostgres | TdbSqlite;
// postgres schema get precedence over sqlite extra userId (optional) field,
export type TJob = InferSelectModel<typeof jobSchema>;
export type TJobInsert = InferInsertModel<typeof jobSchema>;
export type TRole = InferSelectModel<typeof roleSchema>;
export type TRoleInsert = InferInsertModel<typeof roleSchema>;

export interface TPagination {
  limit: number;
  offset: number;
}

export type TInsert<K extends TpgTableKey> =
  | InferInsertModel<TpgTableRegistry[K]>
  | InferInsertModel<TsqliteTableRegistry[K]>;

export type TSelect<K extends TpgTableKey> =
  | InferSelectModel<TpgTableRegistry[K]>
  | InferSelectModel<TsqliteTableRegistry[K]>;

export type TColumnNames<K extends TpgTableKey> = TpgCols<K> | TSqliteCols<K>;

type TColumnValue<K extends TpgTableKey, C extends TColumnNames<K>> =
  | (C extends keyof InferSelectModel<TpgTableRegistry[K]>
      ? InferSelectModel<TpgTableRegistry[K]>[C]
      : never)
  | (C extends keyof InferSelectModel<TsqliteTableRegistry[K]>
      ? InferSelectModel<TsqliteTableRegistry[K]>[C]
      : never);

export type TColumnFilter<K extends TpgTableKey> = {
  [C in TColumnNames<K>]: {
    columnName: C;
    value: TColumnValue<K, C> | TColumnValue<K, C>[];
  };
}[TColumnNames<K>];

export type TSchemaColumn<T extends AnyPgTable | SQLiteTable> = {
  [C in keyof T["_"]["columns"]]: {
    columnName: C;
    value: InferSelectModel<T>[C & keyof InferSelectModel<T>];
  };
}[keyof T["_"]["columns"]];
