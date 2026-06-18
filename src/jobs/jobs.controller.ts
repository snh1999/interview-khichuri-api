import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import { SortBy } from "@/src/config/guards/sort-by.decorator";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { UserId } from "@/src/config/guards/user-id.decorator";
import type {
  TPagination,
  TJob,
  TJobWithTopics,
} from "@/src/database/database.types";

import { CreateJobDto, UpdateJobDto } from "./jobs.dto";
import { JobsService } from "./jobs.service";

@Controller("jobs")
export class JobsController {
  public constructor(private readonly jobsService: JobsService) {}

  @Post()
  public create(
    @Body() dto: CreateJobDto,
    @UserId() userId?: string,
  ): Promise<TJob> {
    return this.jobsService.create(dto, userId);
  }

  @Get()
  public findAll(
    @Pagination() pagination?: TPagination,
    @SortBy(["title", "description", "status", "createdAt", "updatedAt"])
    sortBy?: TSortEntry[],
    @Query("search") search?: string,
    @UserId() userId?: string,
  ): Promise<TJob[]> {
    return this.jobsService.findAll(userId, search, pagination, sortBy);
  }

  @Get(":id")
  public findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TJobWithTopics> {
    return this.jobsService.findOne(id, userId);
  }

  @Patch(":id")
  public update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @UserId() userId?: string,
  ): Promise<TJobWithTopics> {
    return this.jobsService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.jobsService.delete(id, userId);
  }
}
