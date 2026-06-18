import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  InferInsertModel,
  InferSelectModel,
  is,
  like,
  or,
  sql,
} from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  AnySQLiteColumn,
  SQLiteColumn,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";

import { IDatabaseService } from "@/src/database/database.service";
import { TpgTableKey } from "@/src/database/postgres/postgres.service";

import { DATABASE_CONNECTION } from "../database.constants";
import {
  TSingleColumnFilter,
  type TPagination,
  TSchemaColumnFilter,
  TSearchResult,
  TSortBy,
  TColumnFilter,
} from "../database.types";
import * as schemas from "./schemas";

const sqliteTableRegistry = {
  [getTableName(schemas.jobs)]: schemas.jobs,
  [getTableName(schemas.roles)]: schemas.roles,
  [getTableName(schemas.topics)]: schemas.topics,
  [getTableName(schemas.job_topics)]: schemas.job_topics,
  [getTableName(schemas.prep_session)]: schemas.prep_session,
  [getTableName(schemas.session_topics)]: schemas.session_topics,
  [getTableName(schemas.questions)]: schemas.questions,
  [getTableName(schemas.profiles)]: schemas.profiles,
  [getTableName(schemas.profile_links)]: schemas.profile_links,
  [getTableName(schemas.work_overview)]: schemas.work_overview,
  [getTableName(schemas.work_skills)]: schemas.work_skills,
  [getTableName(schemas.industries)]: schemas.industries,
  [getTableName(schemas.work_industries)]: schemas.work_industries,
  [getTableName(schemas.work_experience)]: schemas.work_experience,
  [getTableName(schemas.education)]: schemas.education,
  [getTableName(schemas.job_preference)]: schemas.job_preference,
  [getTableName(schemas.preference_titles)]: schemas.preference_titles,
  [getTableName(schemas.resume)]: schemas.resume,
  [getTableName(schemas.companies)]: schemas.companies,
  [getTableName(schemas.api_key)]: schemas.api_key,
} as const;

export type TdbSqlite = BetterSQLite3Database<typeof schemas>;
export type TsqliteTableRegistry = typeof sqliteTableRegistry;
export type TsqliteTableKey = keyof TsqliteTableRegistry;

type TdbQuery = TdbSqlite extends { query: infer Q } ? Q : never;
export type TsqliteWithRelations<K extends TsqliteTableKey> =
  K extends keyof TdbQuery
    ? TdbQuery[K] extends { findMany: (args?: infer A) => unknown }
      ? Exclude<A, undefined> extends { with?: infer W }
        ? W
        : never
      : never
    : never;

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

  public async withTransaction<T>(
    fn: (tx: TdbSqlite) => Promise<T>,
  ): Promise<T> {
    this.db.run(sql`BEGIN`);
    try {
      const result = await fn(this.db);
      this.db.run(sql`COMMIT`);
      return result;
    } catch (err) {
      this.db.run(sql`ROLLBACK`);
      throw err;
    }
  }

  public create<K extends TsqliteTableKey>(
    schemaName: K,
    data: InferInsertModel<TsqliteTableRegistry[K]>,
    db: TdbSqlite = this.db,
  ): InferSelectModel<TsqliteTableRegistry[K]> {
    const schema = sqliteTableRegistry[schemaName] as SQLiteTable;
    return db.insert(schema).values(data).returning().get() as InferSelectModel<
      TsqliteTableRegistry[K]
    >;
  }

  public createMany<K extends TsqliteTableKey>(
    schemaName: K,
    data: InferInsertModel<TsqliteTableRegistry[K]>[],
    db: TdbSqlite = this.db,
  ): InferSelectModel<TsqliteTableRegistry[K]>[] {
    const schema = sqliteTableRegistry[schemaName] as SQLiteTable;
    return db.insert(schema).values(data).returning().all() as InferSelectModel<
      TsqliteTableRegistry[K]
    >[];
  }

  public findAllByColumn<K extends TsqliteTableKey>(
    schemaName: K,
    columns?: TColumnFilter<K>,
    sortBy?: TSortBy<K>[],
    pagination?: TPagination,
    relations?: TsqliteWithRelations<K>,
  ): InferSelectModel<TsqliteTableRegistry[K]>[] {
    const schema = sqliteTableRegistry[schemaName];

    const conditions = columns
      ? this._buildConditions(schema, columns, getTableName(schema))
      : [];

    if (relations && Object.keys(relations).length > 0) {
      return this.db.query[schemaName].findMany({
        where: conditions.length ? and(...conditions) : undefined,
        with: relations,
        ...(pagination && {
          limit: pagination.limit,
          offset: pagination.offset,
        }),
        // returns SQLiteSyncRelationalQuery,
      }) as unknown as InferSelectModel<TsqliteTableRegistry[K]>[];
    }

    const orderBy = sortBy?.map((s) => {
      const col = schema[s.columnName as keyof typeof schema] as SQLiteColumn;
      return s.order === "desc" ? desc(col) : asc(col);
    });

    const query = this.db
      .select()
      .from(schema)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...(orderBy ?? []));

    if (pagination) {
      query.limit(pagination.limit).offset(pagination.offset);
    }

    return query.all() as InferSelectModel<TsqliteTableRegistry[K]>[];
  }

  public search<K extends TsqliteTableKey>(
    schemaName: K,
    columnNames: TSqliteCols<K>[],
    value: string,
    columns?: TColumnFilter<K>,
    pagination?: TPagination,
  ): TSearchResult<K> {
    const schema = sqliteTableRegistry[schemaName];
    const schemaColumns = getTableColumns(schema);
    const tableName = getTableName(schema);

    const likeConditions = columnNames.map((col) => {
      const colName = String(col);
      if (!(colName in schemaColumns)) {
        throw new BadRequestException(
          `Column "${colName}" not supported by ${tableName}`,
        );
      }
      return like(schemaColumns[colName] as AnySQLiteColumn, `%${value}%`);
    });

    const exactConditions = columns
      ? this._buildConditions(schema, columns, tableName)
      : [];

    const whereClause = and(
      ...(likeConditions.length ? [or(...likeConditions)] : []),
      ...exactConditions,
    );

    const query = this.db.select().from(schema).where(whereClause);

    if (pagination) {
      query.limit(pagination.limit).offset(pagination.offset);
    }

    const data = query.all() as InferSelectModel<TsqliteTableRegistry[K]>[];

    const isFirstPage = !pagination || pagination.offset === 0;
    const countResult = isFirstPage
      ? this.db
          .select({ count: sql<number>`count(*)` })
          .from(schema)
          .where(whereClause)
          .get()
      : undefined;

    return {
      data,
      total: countResult?.count ?? 0,
    };
  }

  public async findById<K extends TsqliteTableKey>(
    schemaName: K,
    id: string | number,
    columns?: TColumnFilter<K>,
    relations?: TsqliteWithRelations<K>,
  ): Promise<InferSelectModel<TsqliteTableRegistry[K]>> {
    const schema = sqliteTableRegistry[schemaName];
    if (
      typeof id === "string" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
    }
    const conditions = columns
      ? this._buildConditions(schema, columns, getTableName(schema))
      : [];

    const allConditions = [...conditions, eq(schema.id, id)];

    const queryWithRelations = relations && Object.keys(relations).length > 0;

    if (queryWithRelations) {
      const data = await this.db.query[schemaName].findFirst({
        where: conditions.length ? and(...allConditions) : eq(schema.id, id),
        with: relations,
      });
      if (!data)
        throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
      return data as InferSelectModel<TsqliteTableRegistry[K]>;
    }

    const data = this.db
      .select()
      .from(schema)
      .where(and(...allConditions))
      .get();
    if (!data)
      throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
    return data as InferSelectModel<TsqliteTableRegistry[K]>;
  }

  public update<K extends TsqliteTableKey>(
    schemaName: K,
    data: Partial<InferInsertModel<TsqliteTableRegistry[K]>>,
    columns?: TColumnFilter<K>,
    db: TdbSqlite = this.db,
  ): InferSelectModel<TsqliteTableRegistry[K]>[] {
    const schema = sqliteTableRegistry[schemaName];

    return this._update(
      schema,
      data,
      (columns ?? []) as TSchemaColumnFilter<typeof schema>[],
      db,
    );
  }

  private _update<T extends TSqliteTableWithId>(
    schema: T,
    data: Partial<InferInsertModel<T>>,
    columns: TSchemaColumnFilter<T>[],
    db: TdbSqlite = this.db,
  ): InferSelectModel<T>[] {
    const conditions = this._buildConditions(
      schema,
      columns as TSchemaColumnFilter<typeof schema>,
      getTableName(schema),
    );

    const result = db
      .update(schema)
      .set(data)
      .where(and(...conditions))
      .returning()
      .all() as InferSelectModel<T>[] | undefined;

    if (!result || result.length === 0) {
      throw new NotFoundException(`Failed to update ${getTableName(schema)}`);
    }
    return result;
  }

  public delete<K extends TsqliteTableKey>(
    schemaName: K,
    columns: TColumnFilter<K>,
    silent = false,
    db: TdbSqlite = this.db,
  ): void {
    const schema = sqliteTableRegistry[schemaName];
    const conditions = this._buildConditions(
      schema,
      columns,
      getTableName(schema),
    );

    const result = db
      .delete(schema)
      .where(and(...conditions))
      .run();

    if (result.changes === 0 && !silent) {
      throw new NotFoundException(
        `Nothing to delete in ${getTableName(schema)}`,
      );
    }
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

    this.db.run(sql.raw("PRAGMA foreign_keys = OFF"));
    try {
      this.db.transaction((tx) => {
        for (const table of tableNames) {
          tx.run(
            sql.raw(`DELETE
                          FROM "${table}"`),
          );
        }
      });
    } finally {
      this.db.run(sql.raw("PRAGMA foreign_keys = ON"));
    }
  }

  private _buildConditions(
    schema: SQLiteTable,
    columns: Record<string, unknown>,
    serviceName: string,
  ): ReturnType<typeof eq>[] {
    const tableColumns = getTableColumns(schema);
    return Object.entries(columns).map(([colName, value]) => {
      if (!(colName in tableColumns)) {
        throw new BadRequestException(
          `Column "${colName}" not supported by ${serviceName}`,
        );
      }
      return eq(tableColumns[colName], value);
    });
  }

  public syncJunctionTable<K extends TsqliteTableKey>(
    schemaName: K,
    parentColumn: TSingleColumnFilter<K>,
    childColumn: TSqliteCols<K>,
    newIds: number[],
    db: TdbSqlite = this.db,
  ): void {
    const schema = sqliteTableRegistry[schemaName];
    const schemaColumns = getTableColumns(schema);
    const { columnName: parentColumnName, value: parentId } = parentColumn;

    const parentCol = schemaColumns[parentColumnName as string] as unknown as
      | AnySQLiteColumn
      | undefined;

    if (!parentCol) {
      throw new BadRequestException(
        `Column "${String(parentColumnName)}" not found in ${getTableName(schema)}`,
      );
    }

    const childCol = schemaColumns[childColumn as string] as
      | AnySQLiteColumn
      | undefined;

    if (!childCol) {
      throw new BadRequestException(
        `Column "${String(childColumn)}" not found in ${getTableName(schema)}`,
      );
    }

    const existing = db
      .select()
      .from(schema)
      .where(eq(parentCol, parentId))
      .all();

    const existingIds = new Set(
      existing.map((row) => row[childColumn as string] as number),
    );
    const incomingIds = new Set(newIds);

    const toDeleteIds = [...existingIds].filter((id) => !incomingIds.has(id));
    const toInsert = newIds.filter((id) => !existingIds.has(id));

    if (toDeleteIds.length > 0) {
      db.delete(schema).where(
        and(eq(parentCol, parentId), inArray(childCol, toDeleteIds)),
      );
    }

    if (toInsert.length > 0) {
      db.insert(schema).values(
        toInsert.map((id) => ({
          [parentColumnName]: parentId,
          [childColumn]: id,
        })) as InferInsertModel<TsqliteTableRegistry[K]>[],
      );
    }
  }

  public syncOneToMany<K extends TsqliteTableKey>(
    schemaName: K,
    parentColumn: TSingleColumnFilter<K>,
    data: (Partial<InferInsertModel<TsqliteTableRegistry[K]>> & {
      id?: string;
    })[],
    db: TdbSqlite = this.db,
  ): void {
    const existing = this.findAllByColumn(schemaName, {
      [parentColumn.columnName]: parentColumn.value,
    } as TColumnFilter<K>) as {
      id: string;
    }[];

    const existingIds = new Set(existing.map((e) => e.id));
    const incomingIds = new Set(data.filter((e) => e.id).map((e) => e.id));

    for (const item of data) {
      const { id: _id, ...itemData } = item;
      if (item.id && existingIds.has(item.id)) {
        this.update(
          schemaName,
          itemData as Partial<InferInsertModel<TsqliteTableRegistry[K]>>,
          { id: item.id } as TColumnFilter<K>,
          db,
        );
      } else {
        this.create(
          schemaName,
          {
            [parentColumn.columnName]: parentColumn.value,
            ...itemData,
          } as InferInsertModel<TsqliteTableRegistry[K]>,
          db,
        );
      }
    }

    for (const existingId of existingIds) {
      if (!incomingIds.has(existingId)) {
        this.delete(
          schemaName,
          { id: existingId } as TColumnFilter<K>,
          true,
          db,
        );
      }
    }
  }
}
