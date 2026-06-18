import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  getTableName,
  is,
  sql,
  eq,
  InferSelectModel,
  InferInsertModel,
  getTableColumns,
  and,
  DrizzleQueryError,
  inArray,
  desc,
  asc,
} from "drizzle-orm";
import { AnyPgColumn, AnyPgTable, PgTable } from "drizzle-orm/pg-core";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { IDatabaseService } from "@/src/database/database.service";

import { DATABASE_CONNECTION } from "../database.constants";
import {
  TSingleColumnFilter,
  TSchemaColumnFilter,
  TSearchResult,
  TFindAllByColumnOptions,
  TFindByIdOptions,
  TSearchOptions,
  TColumnFilter,
} from "../database.types";
import * as schemas from "./schemas";

export type TdbPostgres = PostgresJsDatabase<typeof schemas>;

const postgresTableRegistry = {
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

type TdbQuery = TdbPostgres extends { query: infer Q } ? Q : never;
export type TpgWithRelations<K extends TpgTableKey> = K extends keyof TdbQuery
  ? TdbQuery[K] extends { findMany: (args?: infer A) => unknown }
    ? Exclude<A, undefined> extends { with?: infer W }
      ? W
      : never
    : never
  : never;

export type TpgTableRegistry = typeof postgresTableRegistry;
export type TpgTableKey = keyof TpgTableRegistry;

type PgTableWithId = AnyPgTable & { id: AnyPgColumn };

export type TpgCols<K extends TpgTableKey> =
  keyof TpgTableRegistry[K]["_"]["columns"];

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

  public async withTransaction<T>(
    fn: (tx: TdbPostgres) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(fn);
  }

  public async create<K extends TpgTableKey>(
    schemaName: K,
    data: InferInsertModel<TpgTableRegistry[K]>,
    db: TdbPostgres = this.db,
  ): Promise<InferSelectModel<TpgTableRegistry[K]>> {
    const schema = postgresTableRegistry[schemaName];
    const [result] = await db.insert(schema).values(data).returning();
    return result as InferSelectModel<TpgTableRegistry[K]>;
  }

  public async createMany<K extends TpgTableKey>(
    schemaName: K,
    data: InferInsertModel<TpgTableRegistry[K]>[],
    db: TdbPostgres = this.db,
  ): Promise<InferSelectModel<TpgTableRegistry[K]>[]> {
    const schema = postgresTableRegistry[schemaName];
    const result = await db.insert(schema).values(data).returning();
    return result as InferSelectModel<TpgTableRegistry[K]>[];
  }

  public async findAllByColumn<K extends TpgTableKey>(
    schemaName: K,
    options?: TFindAllByColumnOptions<K>,
  ): Promise<InferSelectModel<TpgTableRegistry[K]>[]> {
    const {
      filter: columns,
      sortBy,
      pagination,
      relation: relations,
    } = options ?? {};
    const schema = postgresTableRegistry[schemaName];
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
      }) as Promise<InferSelectModel<TpgTableRegistry[K]>[]>;
    }

    const orderBy = sortBy?.map((sort) => {
      const col = schema[sort.columnName as keyof typeof schema] as AnyPgColumn;
      return sort.order === "desc" ? desc(col) : asc(col);
    });

    const query = this.db
      .select()
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      .from(schema as AnyPgTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...(orderBy ?? []));

    if (pagination) {
      query.limit(pagination.limit).offset(pagination.offset);
    }

    return (await query) as unknown as InferSelectModel<TpgTableRegistry[K]>[];
  }

  public async findById<K extends TpgTableKey>(
    schemaName: K,
    id: string | number,
    options?: TFindByIdOptions<K>,
  ): Promise<InferSelectModel<TpgTableRegistry[K]>> {
    const { filter, relation: relations } = options ?? {};
    const schema = postgresTableRegistry[schemaName];
    if (
      typeof id === "string" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
    }
    const conditions = filter
      ? this._buildConditions(schema, filter, getTableName(schema))
      : [];

    const allConditions = [...conditions, eq((schema as PgTableWithId).id, id)];

    if (relations && Object.keys(relations).length > 0) {
      const result = await this.db.query[schemaName].findFirst({
        where: and(...allConditions),
        with: relations,
      });
      if (!result)
        throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
      return result as InferSelectModel<TpgTableRegistry[K]>;
    }

    const result = await this.db
      .select()
      // Drizzle #4367: generic indexed table types fail TableLikeHasEmptySelection.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      .from(schema as PgTableWithId)
      .where(and(...[...conditions, eq(schema.id, id)]));

    if (result.length === 0) {
      throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
    }

    return result[0] as InferSelectModel<TpgTableRegistry[K]>;
  }

  public async search<K extends TpgTableKey>(
    schemaName: K,
    columnNames: TpgCols<K>[],
    value: string,
    options?: TSearchOptions<K>,
  ): Promise<TSearchResult<K>> {
    const { filter, pagination } = options ?? {};
    const schema = postgresTableRegistry[schemaName];
    const schemaColumns = getTableColumns(schema);

    const cols = columnNames.map((colName) => {
      const col = schemaColumns[colName];
      if (!col) {
        throw new BadRequestException(
          `Column "${String(colName)}" not supported by ${getTableName(schema)}`,
        );
      }
      return col;
    });

    const vectorExpr =
      cols.length === 1
        ? sql`to_tsvector('english', ${cols[0]}::text)`
        : sql`to_tsvector('english', ${sql.join(
            cols.map((c) => sql`coalesce(${c}::text, '')`),
            sql` || ' ' || `,
          )})`;

    const queryExpr = sql`plainto_tsquery('english', ${value})`;

    const ftsWhere = sql`${vectorExpr} @@ ${queryExpr}`;

    const conditions = filter
      ? this._buildConditions(schema, filter, getTableName(schema))
      : [];

    const whereClause = conditions.length
      ? and(ftsWhere, ...conditions)
      : ftsWhere;

    const baseQuery = this.db
      .select()
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      .from(schema as AnyPgTable)
      .where(whereClause)
      .orderBy(sql`ts_rank(${vectorExpr}, ${queryExpr}) DESC`);

    if (pagination) {
      baseQuery.limit(pagination.limit).offset(pagination.offset);
    }

    const isFirstPage = !pagination || pagination.offset === 0;
    const [data, countResult] = await Promise.all([
      baseQuery,
      isFirstPage
        ? this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema as AnyPgTable)
            .where(whereClause)
        : Promise.resolve(null),
    ]);

    return {
      data: data as InferSelectModel<TpgTableRegistry[K]>[],
      total: countResult ? countResult[0].count : undefined,
    };
  }

  public async update<K extends TpgTableKey>(
    schemaName: K,
    data: Partial<InferInsertModel<TpgTableRegistry[K]>>,
    columns: TColumnFilter<K>,
    db: TdbPostgres = this.db,
  ): Promise<InferSelectModel<TpgTableRegistry[K]>[]> {
    const schema = postgresTableRegistry[schemaName] as TpgTableRegistry[K] &
      PgTableWithId;

    return this._update(
      schema,
      data,
      columns as TSchemaColumnFilter<typeof schema>,
      db,
    );
  }

  private async _update<T extends PgTableWithId>(
    schema: T,
    data: Partial<InferInsertModel<T>>,
    columns: TSchemaColumnFilter<T>,
    db: TdbPostgres = this.db,
  ): Promise<InferSelectModel<T>[]> {
    const conditions = this._buildConditions(
      schema,
      columns,
      getTableName(schema),
    );

    let result: InferSelectModel<T>[];
    try {
      result = await db
        .update(schema)
        .set(data)
        .where(and(...conditions))
        .returning();
    } catch (error) {
      if (error instanceof DrizzleQueryError) {
        throw new NotFoundException(`Could not update ${getTableName(schema)}`);
      }
      throw error;
    }

    if (result.length === 0) {
      throw new NotFoundException(`Could not update ${getTableName(schema)}`);
    }
    return result;
  }

  public async delete<K extends TpgTableKey>(
    schemaName: K,
    columns: TColumnFilter<K>,
    silent = false,
    db: TdbPostgres = this.db,
  ): Promise<void> {
    const schema = postgresTableRegistry[schemaName];
    const conditions = this._buildConditions(
      schema,
      columns,
      getTableName(schema),
    );

    try {
      const result = await db
        .delete(schema)
        .where(and(...conditions))
        .returning();
      if (result.length === 0 && !silent) throw new NotFoundException();
    } catch (error) {
      if (error instanceof DrizzleQueryError) {
        throw new NotFoundException(
          `Nothing to delete in ${getTableName(schema)}`,
        );
      }
      throw error;
    }
  }

  public async dbClear(): Promise<void> {
    const allowedModes = ["development", "test", "local"];
    if (!allowedModes.includes(process.env.NODE_ENV ?? "")) {
      throw new BadRequestException("Cannot delete production data");
    }

    const tableNames = (Object.values(schemas) as unknown[])
      .filter((table): table is PgTable => is(table, PgTable))
      .map((table) => `"${getTableName(table)}"`)
      .join(", ");

    if (tableNames.length === 0) return;

    await this.db.execute(sql.raw(`TRUNCATE TABLE ${tableNames} CASCADE`));
  }

  private _buildConditions(
    schema: AnyPgTable,
    columns: Record<string, unknown>,
    schemaName: string,
  ): ReturnType<typeof eq>[] {
    const schemaColumns = getTableColumns(schema);
    return Object.entries(columns).map(([colName, value]) => {
      if (!(colName in schemaColumns)) {
        throw new BadRequestException(
          `Column "${colName}" not supported by ${schemaName}`,
        );
      }
      return Array.isArray(value)
        ? inArray(schemaColumns[colName], value)
        : eq(schemaColumns[colName], value);
    });
  }

  public async syncJunctionTable<K extends TpgTableKey>(
    schemaName: K,
    parentColumn: TSingleColumnFilter<K>,
    childColumn: TpgCols<K>,
    newIds: number[],
    db: TdbPostgres = this.db,
  ): Promise<void> {
    const schema = postgresTableRegistry[schemaName];
    const schemaColumns = getTableColumns(schema);
    const { columnName: parentColumnName, value: parentId } = parentColumn;

    const parentCol = schemaColumns[parentColumnName as string] as
      | AnyPgColumn
      | undefined;

    if (!parentCol) {
      throw new BadRequestException(
        `Column "${String(parentColumnName)}" not found in ${getTableName(schema)}`,
      );
    }

    const childCol = schemaColumns[childColumn as string] as
      | AnyPgColumn
      | undefined;
    if (!childCol) {
      throw new BadRequestException(
        `Column "${String(childColumn)}" not found in ${getTableName(schema)}`,
      );
    }

    const existing = await db
      .select()
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      .from(schema as AnyPgTable)
      .where(eq(parentCol, parentId));

    const existingIds = new Set(
      existing.map((row) => row[childColumn as string] as number),
    );
    const incomingIds = new Set(newIds);

    const toDeleteIds = [...existingIds].filter((id) => !incomingIds.has(id));
    const toInsert = newIds.filter((id) => !existingIds.has(id));

    if (toDeleteIds.length > 0) {
      await db
        .delete(schema)
        .where(and(eq(parentCol, parentId), inArray(childCol, toDeleteIds)));
    }

    if (toInsert.length > 0) {
      await db.insert(schema).values(
        toInsert.map((id) => ({
          [parentColumnName]: parentId,
          [childColumn]: id,
        })) as InferInsertModel<TpgTableRegistry[K]>[],
      );
    }
  }

  public async syncOneToMany<K extends TpgTableKey>(
    schemaName: K,
    parentColumn: TSingleColumnFilter<K>,
    data: (Partial<InferInsertModel<TpgTableRegistry[K]>> & { id?: string })[],
    db: TdbPostgres = this.db,
  ): Promise<void> {
    const existing = (await this.findAllByColumn(schemaName, {
      filter: {
        [parentColumn.columnName]: parentColumn.value,
      } as TColumnFilter<K>,
    })) as unknown as { id: string }[];

    const existingIds = new Set(existing.map((e) => e.id));
    const incomingIds = new Set(data.filter((e) => e.id).map((e) => e.id));

    for (const item of data) {
      if (item.id && existingIds.has(item.id)) {
        const { id: _id, ...updateData } = item;
        await this.update(
          schemaName,
          updateData as Partial<InferInsertModel<TpgTableRegistry[K]>>,
          { id: item.id } as TColumnFilter<K>,
          db,
        );
      } else {
        const { id: _id, ...insertData } = item;
        await this.create(
          schemaName,
          {
            [parentColumn.columnName]: parentColumn.value,
            ...insertData,
          } as InferInsertModel<TpgTableRegistry[K]>,
          db,
        );
      }
    }

    for (const existingId of existingIds) {
      if (!incomingIds.has(existingId)) {
        await this.delete(
          schemaName,
          { id: existingId } as TColumnFilter<K>,
          true,
          db,
        );
      }
    }
  }
}
