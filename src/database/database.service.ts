import type {
  TSingleColumnFilter,
  TColumnNames,
  TDatabase,
  TInsert,
  TReturn,
  TSearchResult,
  TSelect,
  TFindAllByColumnOptions,
  TFindByIdOptions,
  TSearchOptions,
  TColumnFilter,
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

  abstract createMany<K extends TpgTableKey>(
    schemaName: K,
    data: TInsert<K>[],
    db?: TDatabase,
  ): TReturn<TSelect<K>[]>;

  abstract count<K extends TpgTableKey>(
    schemaName: K,
    columns?: TColumnFilter<K>,
    db?: TDatabase,
  ): Promise<number>;

  abstract findAllByColumn<K extends TpgTableKey>(
    schemaName: K,
    options?: TFindAllByColumnOptions<K>,
  ): TReturn<TSelect<K>[]>;

  abstract search<K extends TpgTableKey>(
    schemaName: K,
    columnNames: TColumnNames<K>[],
    value: string,
    options?: TSearchOptions<K>,
  ): TReturn<TSearchResult<K>>;

  abstract findById<K extends TpgTableKey>(
    schemaName: K,
    id: string | number,
    options?: TFindByIdOptions<K>,
  ): TReturn<TSelect<K>>;

  abstract update<K extends TpgTableKey>(
    schemaName: K,
    data: Partial<TInsert<K>>,
    columns: TColumnFilter<K>,
    db?: TDatabase,
  ): TReturn<TSelect<K>[]>;

  public abstract delete<K extends TpgTableKey>(
    schemaName: K,
    columns: TColumnFilter<K>,
    silent?: boolean,
    db?: TDatabase,
  ): TReturn<void>;

  /**
   * Synchronizes a many-to-many junction table for a given parent.
   *
   * Fetches existing child IDs for the parent,
   * - diffs against `newIds`,
   * - deletes orphans,
   * - inserts missing relations.
   * Unchanged rows are left alone.
   * The entire operation runs on the provided `db` client (uses a transaction client for atomicity).
   *
   * @example
   * await this.db.syncJunctionTable(
   *   'work_skills',
   *   { column: 'workId', value: 42 },
   *   'topicId',
   *   [1, 5, 12],
   *   transaction,
   * );
   */

  public abstract syncJunctionTable<K extends TpgTableKey>(
    schemaName: K,
    parentColumn: TSingleColumnFilter<K>,
    childColumn: TColumnNames<K>,
    // junction table PKs are number
    newIds: number[],
    db?: TDatabase,
  ): TReturn<void>;

  /**
   * Synchronizes a one-to-many array of child rows for a given parent.
   *
   * Compares incoming items against existing DB rows by `id`.
   * Items with a matching existing ID are updated;
   * items without an ID (or unknown ID) are created with the parent FK attached;
   * existing rows not present in the input are deleted.
   *
   * Returns the persisted `id` for every item in `data`, aligned to the input order.
   * Use this when a caller needs the generated IDs of newly created rows
   * (e.g. to sync a nested junction table afterwards).
   *
   * @example
   * const ids = await this.db.syncOneToMany(
   *   'work_experience',
   *   { column: 'profileId', value: 'user-123' },
   *   dto.experiences,
   *   transaction,
   * );
   */
  public abstract syncOneToMany<K extends TpgTableKey>(
    schemaName: K,
    parentColumn: TSingleColumnFilter<K>,
    data: (Partial<TInsert<K>> & { id?: string | number })[],
    db?: TDatabase,
  ): TReturn<(string | number)[]>;
}
