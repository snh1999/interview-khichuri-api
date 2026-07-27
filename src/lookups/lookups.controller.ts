import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import { SortBy } from "@/src/config/guards/sort-by.decorator";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import type { TPagination } from "@/src/database/database.types";
import { TLookupMap, LookupSchemaPipe } from "@/src/lookups/lookups.helpers";

import { CreateLookupDto, UpdateLookupDto } from "./lookups.dto";
import type { TLookupSchema } from "./lookups.helpers";
import { LookupsService } from "./lookups.service";

@Controller("lookups/:schema")
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Post()
  public create<T extends TLookupSchema>(
    @Param("schema", LookupSchemaPipe) schema: T,
    @Body() dto: CreateLookupDto,
  ): Promise<TLookupMap[T]> {
    return this.lookupsService.create(schema, dto);
  }

  @Get()
  public findAll<T extends TLookupSchema>(
    @Param("schema", LookupSchemaPipe) schema: T,
    @Pagination() pagination?: TPagination,
    @SortBy(["name", "isApproved"]) sortBy?: TSortEntry[],
    @Query("name") name?: string,
  ): Promise<TLookupMap[T][]> {
    return this.lookupsService.findAll(schema, name, pagination, sortBy);
  }

  @Patch(":id")
  @Roles(["admin"])
  public update<T extends TLookupSchema>(
    @Param("schema", LookupSchemaPipe) schema: T,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateLookupDto,
  ): Promise<TLookupMap[T]> {
    return this.lookupsService.update(schema, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(["admin"])
  public delete(
    @Param("schema", LookupSchemaPipe) schema: TLookupSchema,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    return this.lookupsService.delete(schema, id);
  }
}
