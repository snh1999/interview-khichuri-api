import type {
  TColumnFilter,
  TDatabase,
  TInsert,
  TPagination,
  TReturn,
  TSelect,
} from "@/src/database/database.types";
import type { TpgTableKey } from "@/src/database/postgres/postgres.service";

/**
 * Abstract database service. Wraps required drizzle operations behind a driver-agnostic interface.
 * Concrete impls: PostgresService, SqliteService.
 *
 * Pass optional `db` param to thread a transaction client through operations.
 * Caller is responsible for passing the same `db` to all ops within a transaction.
 *
 * @example
 * // normal use
 * await this.db.create('jobs', data);
 *
 * // transactional use (pseudo — withTransaction TBD)
 * await client.transaction(async (tx) => {
 *   await this.db.create('jobs', jobData, tx);
 *   await this.db.create('roles', roleData, tx);
 * });
 */
export abstract class IDatabaseService {
  public abstract database(): TDatabase;
  public abstract withTransaction<T>(
    fn: (tx: TDatabase) => Promise<T>,
  ): Promise<T>;

  public abstract dbPing(): TReturn<void>;
  public abstract dbClear(): TReturn<void>;

  abstract create<K extends TpgTableKey>(
    schemaName: K,
    data: TInsert<K>,
    db?: TDatabase,
  ): TReturn<TSelect<K>>;

  abstract findAllByColumn<K extends TpgTableKey>(
    schemaName: K,
    column?: TColumnFilter<K>[],
    pagination?: TPagination,
  ): TReturn<TSelect<K>[]>;

  abstract findById<K extends TpgTableKey>(
    schemaName: K,
    id: string | number,
    columns?: TColumnFilter<K>[],
  ): TReturn<TSelect<K>>;

  abstract update<K extends TpgTableKey>(
    schemaName: K,
    data: Partial<TInsert<K>>,
    columns: TColumnFilter<K>[],
    db?: TDatabase,
  ): TReturn<TSelect<K>[]>;

  public abstract delete<K extends TpgTableKey>(
    schemaName: K,
    columns: TColumnFilter<K>[],
    db?: TDatabase,
  ): TReturn<void>;
}
