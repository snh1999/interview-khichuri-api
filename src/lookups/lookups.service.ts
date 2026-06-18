import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
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
  ): Promise<TLookupMap[T][]> {
    if (name) {
      const result = await this.db.search(schema, ["name"], name);
      return result.data as TLookupMap[T][];
    }
    return this.db.findAllByColumn(schema) as Promise<TLookupMap[T][]>;
  }

  async update<T extends TLookupSchema>(
    schema: T,
    id: number,
    dto: UpdateLookupDto,
  ): Promise<TLookupMap[T]> {
    const result = await this.db.update(
      schema,
      dto as never,
      { id } as never,
    );
    return result[0] as TLookupMap[T];
  }

  async delete(schema: TLookupSchema, id: number): Promise<void> {
    return this.db.delete(schema, { id });
  }
}
