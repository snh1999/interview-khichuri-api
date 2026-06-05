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
} from "drizzle-orm";
import { AnyPgColumn, AnyPgTable, PgTable } from "drizzle-orm/pg-core";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { IDatabaseService } from "@/src/database/database.service";

import { DATABASE_CONNECTION } from "../database.constants";
import { TColumnFilter, TSchemaColumn } from "../database.types";
import * as schemas from "./schemas";

export type TdbPostgres = PostgresJsDatabase<typeof schemas>;

const postgresTableRegistry = {
  [getTableName(schemas.jobSchema)]: schemas.jobSchema,
  [getTableName(schemas.roleSchema)]: schemas.roleSchema,
} as const;

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

  public async create<K extends TpgTableKey>(
    schemaName: K,
    data: InferInsertModel<TpgTableRegistry[K]>,
  ): Promise<InferSelectModel<TpgTableRegistry[K]>> {
    if ("userId" in data && !data.userId) {
      throw new BadRequestException("User id is required");
    }
    const schema = postgresTableRegistry[schemaName];
    const [result] = await this.db.insert(schema).values(data).returning();
    return result as InferSelectModel<TpgTableRegistry[K]>;
  }

  public async findAllByColumn<K extends TpgTableKey>(
    schemaName: K,
    columns?: TColumnFilter<K>[],
  ): Promise<InferSelectModel<TpgTableRegistry[K]>[]> {
    const schema = postgresTableRegistry[schemaName];

    if (!columns || columns.length === 0) {
      return (
        (await this.db
          .select()
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          .from(schema as AnyPgTable)) as unknown as InferSelectModel<
          TpgTableRegistry[K]
        >[]
      );
    }

    const conditions = this._buildConditions(
      schema,
      columns as TSchemaColumn<typeof schema>[],
      getTableName(schema),
    );

    return (
      (await this.db
        .select()
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        .from(schema as AnyPgTable)
        .where(and(...conditions))) as unknown as InferSelectModel<
        TpgTableRegistry[K]
      >[]
    );
  }

  public async update<K extends TpgTableKey>(
    schemaName: K,
    data: Partial<InferInsertModel<TpgTableRegistry[K]>>,
    columns: TColumnFilter<K>[],
  ): Promise<InferSelectModel<TpgTableRegistry[K]>> {
    const schema = postgresTableRegistry[schemaName] as TpgTableRegistry[K] &
      PgTableWithId;

    return this._update(
      schema,
      data,
      columns as TSchemaColumn<typeof schema>[],
    );
  }

  private async _update<T extends PgTableWithId>(
    schema: T,
    data: Partial<InferInsertModel<T>>,
    columns: TSchemaColumn<T>[],
  ): Promise<InferSelectModel<T>> {
    const conditions = this._buildConditions(
      schema,
      columns,
      getTableName(schema),
    );

    let result: InferSelectModel<T>[];
    try {
      result = await this.db
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
    return result[0];
  }

  public async findById<K extends TpgTableKey>(
    schemaName: K,
    id: string,
    columns?: TColumnFilter<K>[],
  ): Promise<InferSelectModel<TpgTableRegistry[K]>> {
    const schema = postgresTableRegistry[schemaName];
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new NotFoundException(`${getTableName(schema)} ${id} not found`);
    }
    const conditions = columns
      ? this._buildConditions(
          schema,
          columns as TSchemaColumn<typeof schema>[],
          getTableName(schema),
        )
      : [];

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

  public async delete<K extends TpgTableKey>(
    schemaName: K,
    columns: TColumnFilter<K>[],
  ): Promise<void> {
    const schema = postgresTableRegistry[schemaName];
    const conditions = this._buildConditions(
      schema,
      columns as TSchemaColumn<typeof schema>[],
      getTableName(schema),
    );

    let affectedRows = 0;
    try {
      const result = await this.db
        .delete(schema)
        .where(and(...conditions))
        .returning();
      affectedRows = result.length;
    } catch (error) {
      if (error instanceof DrizzleQueryError) {
        throw new NotFoundException(
          `Nothing to delete in ${getTableName(schema)}`,
        );
      }
      throw error;
    }
    if (affectedRows === 0)
      throw new NotFoundException(
        `Nothing to delete in ${getTableName(schema)}`,
      );
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

  private _buildConditions<T extends AnyPgTable>(
    schema: T,
    columns: TSchemaColumn<T>[],
    schemaName: string,
  ): ReturnType<typeof eq>[] {
    const schemaColumns = getTableColumns(schema);
    return columns.map(({ columnName, value }) => {
      const colName = String(columnName);
      if (!(columnName in schemaColumns)) {
        throw new BadRequestException(
          `Column "${colName}" not supported by ${schemaName}`,
        );
      }

      return eq(schemaColumns[colName], value);
    });
  }
}
