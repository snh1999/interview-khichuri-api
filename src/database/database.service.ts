import type {
  TColumnFilter,
  TDatabase,
  TInsert,
  TReturn,
  TSelect,
} from "@/src/database/database.types";
import type { TpgTableKey } from "@/src/database/postgres/postgres.service";

export abstract class IDatabaseService {
  public abstract database(): TDatabase;
  public abstract dbPing(): TReturn<void>;
  public abstract dbClear(): TReturn<void>;

  abstract create<K extends TpgTableKey>(
    schemaName: K,
    data: TInsert<K>,
  ): TReturn<TSelect<K>>;

  abstract findAllByColumn<K extends TpgTableKey>(
    schemaName: K,
    column?: TColumnFilter<K>[],
  ): TReturn<TSelect<K>[]>;

  abstract findById<K extends TpgTableKey>(
    schemaName: K,
    id: string,
    columns?: TColumnFilter<K>[],
  ): TReturn<TSelect<K>>;

  abstract update<K extends TpgTableKey>(
    schemaName: K,
    data: Partial<TInsert<K>>,
    columns: TColumnFilter<K>[],
  ): TReturn<TSelect<K>>;

  public abstract delete<K extends TpgTableKey>(
    schemaName: K,
    columns: TColumnFilter<K>[],
  ): TReturn<void>;
}
