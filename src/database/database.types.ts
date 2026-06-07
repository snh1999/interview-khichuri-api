import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type {
  TdbPostgres,
  TpgCols,
  TpgTableKey,
  TpgTableRegistry,
  TpgWithRelations,
} from "@/src/database/postgres/postgres.service";
import type { jobs, roles, topics } from "@/src/database/postgres/schemas";
import type {
  TdbSqlite,
  TSqliteCols,
  TsqliteTableRegistry,
  TsqliteWithRelations,
} from "@/src/database/sqlite/sqlite.service";

export type TReturn<T> = Promise<T> | T;
export type TDatabase = TdbPostgres | TdbSqlite;

export type TdbWithRelations<K extends TpgTableKey> =
  | TsqliteWithRelations<K>
  | TpgWithRelations<K>;

// postgres schema get precedence over sqlite for extra FK userId (optional),
export type TJob = InferSelectModel<typeof jobs>;
export type TJobInsert = InferInsertModel<typeof jobs>;

export type TRole = InferSelectModel<typeof roles>;
export type TRoleInsert = InferInsertModel<typeof roles>;

export type TTopics = InferSelectModel<typeof topics>;
export type TTopicsInsert = InferInsertModel<typeof topics>;

type TJobTopicRelation = {
  id: number;
  jobId: string;
  topicId: number;
  topic: InferSelectModel<typeof topics>;
};

export type TJobWithTopics = InferSelectModel<typeof jobs> & {
  jobTopics: TJobTopicRelation[];
};

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

export interface TSearchResult<K extends TpgTableKey> {
  data: TSelect<K>[];
  total?: number;
}

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
