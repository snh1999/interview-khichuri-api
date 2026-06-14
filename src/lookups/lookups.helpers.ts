import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

import type { TIndustry, TRole, TTopics } from "@/src/database/database.types";

export interface TLookupMap {
  roles: TRole;
  topics: TTopics;
  industries: TIndustry;
}

export type TLookupSchema = keyof TLookupMap;

@Injectable()
export class LookupSchemaPipe implements PipeTransform {
  private valid = new Set(["roles", "topics", "industries"]);

  transform(value: string): TLookupSchema {
    if (!this.valid.has(value)) {
      throw new BadRequestException(`Invalid schema: ${value}`);
    }
    return value as TLookupSchema;
  }
}
