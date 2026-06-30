import { Injectable } from "@nestjs/common";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { IDatabaseService } from "@/src/database/database.service";
import type { TPagination, TSortBy } from "@/src/database/database.types";
import { CreateLookupDto, UpdateLookupDto } from "@/src/lookups/lookups.dto";

import { TLookupMap, TLookupSchema } from "./lookups.helpers";

@Injectable()
export class LookupsService {
  public constructor(private readonly db: IDatabaseService) {}

  async create<T extends TLookupSchema>(
    schema: T,
    dto: CreateLookupDto,
  ): Promise<TLookupMap[T]> {
    return this.db.create(schema, dto as never) as Promise<TLookupMap[T]>;
  }

  async findAll<T extends TLookupSchema>(
    schema: T,
    name?: string,
    pagination?: TPagination,
    sortBy?: TSortEntry[],
  ): Promise<TLookupMap[T][]> {
    if (name) {
      const result = await this.db.search(schema, ["name"], name);
      return result.data as TLookupMap[T][];
    }
    return this.db.findAllByColumn(schema, {
      pagination,
      sortBy: sortBy as TSortBy<T>[],
    }) as Promise<TLookupMap[T][]>;
  }

  async update<T extends TLookupSchema>(
    schema: T,
    id: number,
    dto: UpdateLookupDto,
  ): Promise<TLookupMap[T]> {
    const result = await this.db.update(schema, dto as never, { id } as never);
    return result[0] as TLookupMap[T];
  }

  async delete(schema: TLookupSchema, id: number): Promise<void> {
    return this.db.delete(schema, { id });
  }

  async resolveOrCreateNames(
    schema: TLookupSchema,
    names?: string[] | null,
  ): Promise<number[]> {
    if (!names || names.length === 0) return [];

    const uniqueNames = [...new Set(names)];

    const existing = await this.db.findAllByColumn(schema, {
      filter: { name: uniqueNames },
    });

    const nameIdMap = new Map<string, number>(
      existing.map((e) => [e.name, e.id]),
    );

    const newRecords: { name: string }[] = [];
    for (const name of uniqueNames) {
      if (!nameIdMap.has(name)) newRecords.push({ name });
    }

    if (newRecords.length > 0) {
      const created = await this.db.createMany(schema, newRecords);
      for (const record of created) {
        nameIdMap.set(record.name, record.id);
      }
    }

    return names.map((n) => {
      const id = nameIdMap.get(n);
      if (id === undefined) throw new Error(`Failed to resolve name: ${n}`);
      return id;
    });
  }

  async resolveOrCreateName(
    schema: TLookupSchema,
    name?: string | null,
  ): Promise<number | null> {
    if (!name) return null;

    const existing = await this.db.findAllByColumn(schema, {
      filter: { name },
    });

    if (existing.length === 0) {
      const created = await this.db.create(schema, { name });
      return created.id;
    }

    return existing[0].id;
  }
}
