import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  eq,
  getTableColumns,
  getTableName,
  InferInsertModel,
  InferSelectModel,
  is,
  sql,
} from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import { IDatabaseService } from "@/src/database/database.service";
import { TpgTableKey } from "@/src/database/postgres/postgres.service";

import { DATABASE_CONNECTION } from "../database.constants";
import { TColumnFilter, TSchemaColumn } from "../database.types";
import * as schemas from "./schemas";

const sqliteTableRegistry = {
  [getTableName(schemas.jobSchema)]: schemas.jobSchema,
} as const;

export type TdbSqlite = BetterSQLite3Database<typeof schemas>;
export type TsqliteTableRegistry = typeof sqliteTableRegistry;
export type TsqliteTableKey = keyof TsqliteTableRegistry;

export type TSqliteTableWithId = SQLiteTable & { id: SQLiteColumn };

export type TSqliteCols<K extends TpgTableKey> =
  keyof TsqliteTableRegistry[K]["_"]["columns"];

@Injectable()
// eslint-disable-next-line @darraghor/nestjs-typed/injectable-should-be-provided
export class SqliteService implements IDatabaseService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: TdbSqlite,
  ) {}

  public database(): TdbSqlite {
    return this.db;
  }

  public create<K extends TsqliteTableKey>(
    schemaName: K,
    data: InferInsertModel<TsqliteTableRegistry[K]>,
  ): InferSelectModel<TsqliteTableRegistry[K]> {
    const schema = sqliteTableRegistry[schemaName];
    return this._create(schema, data);
  }

  private _create<T extends TSqliteTableWithId>(
    schema: T,
    data: InferInsertModel<T>,
  ): InferSelectModel<T> {
    return this.db
      .insert(schema)
      .values(data)
      .returning()
      .get() as InferSelectModel<T>;
  }

  public findAllByColumn<K extends TsqliteTableKey>(
    schemaName: K,
    columns?: TColumnFilter<K>[],
  ): InferSelectModel<TsqliteTableRegistry[K]>[] {
    const schema = sqliteTableRegistry[schemaName as TsqliteTableKey];

    if (!columns || columns.length === 0) {
      return this.db.select().from(schema).all() as InferSelectModel<
        TsqliteTableRegistry[K]
      >[];
    }

    const conditions = this._buildConditions(
      schema,
      columns as TSchemaColumn<typeof schema>[],
      getTableName(schema),
    );

    return this.db
      .select()
      .from(schema)
      .where(and(...conditions))
      .all() as InferSelectModel<TsqliteTableRegistry[K]>[];
  }

  public update<K extends TsqliteTableKey>(
    schemaName: K,
    data: Partial<InferInsertModel<TsqliteTableRegistry[K]>>,
    columns?: TColumnFilter<K>[],
  ): InferSelectModel<TsqliteTableRegistry[K]> {
    const schema = sqliteTableRegistry[schemaName];
    return this._update(
      schema,
      data,
      columns as TSchemaColumn<typeof schema>[],
    );
  }

  private _update<T extends TSqliteTableWithId>(
    schema: T,
    data: Partial<InferInsertModel<T>>,
    columns: TSchemaColumn<T>[],
  ): InferSelectModel<T> {
    const conditions = this._buildConditions(
      schema,
      columns,
      getTableName(schema),
    );

    const result = this.db
      .update(schema)
      .set(data)
      .where(and(...conditions))
      .returning()
      .get() as InferSelectModel<T> | undefined;

    if (!result) {
      throw new NotFoundException(`Failed to update ${getTableName(schema)}`);
    }
    return result;
  }

  public findById<K extends TsqliteTableKey>(
    schemaName: K,
    id: string,
    columns?: TColumnFilter<K>[],
  ): InferSelectModel<TsqliteTableRegistry[K]> {
    const schema = sqliteTableRegistry[schemaName as TsqliteTableKey];
    const conditions = columns
      ? this._buildConditions(
          schema,
          columns as TSchemaColumn<typeof schema>[],
          getTableName(schema),
        )
      : [];

    const data = this.db
      .select()
      .from(schema)
      .where(and(...[...conditions, eq(schema.id, id)]))
      .get();
    if (!data)
      throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
    return data as InferSelectModel<TsqliteTableRegistry[K]>;
  }

  public delete<K extends TsqliteTableKey>(
    schemaName: K,
    columns?: TColumnFilter<K>[],
  ): void {
    const schema = sqliteTableRegistry[schemaName];
    const conditions = this._buildConditions(
      schema,
      columns as TSchemaColumn<typeof schema>[],
      getTableName(schema),
    );

    const data = this.db
      .delete(schema)
      .where(and(...conditions))
      .returning()
      .get();

    if (!data)
      throw new NotFoundException(
        `Nothing to delete in ${getTableName(schema)}`,
      );
  }

  public dbPing(): void {
    this.db.run(sql`SELECT 1`);
  }

  public dbClear(): void {
    const allowedModes = ["development", "test", "local"];
    if (!allowedModes.includes(process.env.NODE_ENV ?? "")) {
      throw new BadRequestException("Cannot delete production data");
    }

    const tableNames = (Object.values(schemas) as unknown[])
      .filter((table): table is SQLiteTable => is(table, SQLiteTable))
      .map((table) => getTableName(table));

    if (tableNames.length === 0) return;

    this.db.transaction((tx) => {
      for (const table of tableNames) {
        tx.run(sql.raw(`DELETE FROM "${table}"`));
      }
    });
  }

  private _buildConditions<T extends SQLiteTable>(
    schema: T,
    columns: TSchemaColumn<T>[],
    serviceName: string,
  ): ReturnType<typeof eq>[] {
    const tableColumns = getTableColumns(schema);
    return columns.map(({ columnName, value }) => {
      const colName = String(columnName);
      if (!(String(columnName) in tableColumns)) {
        throw new BadRequestException(
          `Column "${colName}" not supported by ${serviceName}`,
        );
      }
      return eq(tableColumns[colName], value);
    });
  }
}
