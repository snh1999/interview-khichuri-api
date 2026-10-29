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
import {
  JOB_SORTABLE,
  SortBy,
  TRACKED_JOB_SORTABLE,
  TSortEntry,
} from "@/src/config/guards/sort-by.decorator";
import { UserId } from "@/src/config/guards/user-id.decorator";
import type { TPagination, TJob } from "@/src/database/database.types";

import { JobsQuery } from "./jobs-query.decorator";
import {
  CreateJobDto,
  ExtractJobDto,
  FindJobByUrlDto,
  GenerateFromTemplateDto,
  TJobPopulated,
  UpdateJobDto,
  UpdateTrackedJobDto,
} from "./jobs.dto";
import type { TJobExtractionResult, TJobsQuery } from "./jobs.dto";
import { JobsService } from "./jobs.service";

@Controller("jobs")
export class JobsController {
  public constructor(private readonly jobsService: JobsService) {}

  @Post()
  public create(
    @Body() dto: CreateJobDto,
    @UserId() userId?: string,
  ): Promise<TJobPopulated> {
    return this.jobsService.create(dto, userId);
  }

  @Post("extract")
  public extractJob(
    @Body() dto: ExtractJobDto,
    @UserId() userId?: string,
  ): Promise<TJobExtractionResult> {
    return this.jobsService.extractJob(dto, userId);
  }

  @Post(":id/cover-letter")
  public generateCoverLetter(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GenerateFromTemplateDto,
    @UserId() userId?: string,
  ): Promise<{ markdown: string }> {
    return this.jobsService.generateCoverLetter(id, dto, userId);
  }

  @Post(":id/outreach")
  public generateOutreachEmail(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GenerateFromTemplateDto,
    @UserId() userId?: string,
  ): Promise<{ markdown: string }> {
    return this.jobsService.generateOutreachEmail(id, dto, userId);
  }

  @Post(":id/linkedin-dm")
  public generateLinkedInDm(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GenerateFromTemplateDto,
    @UserId() userId?: string,
  ): Promise<{ markdown: string }> {
    return this.jobsService.generateLinkedInDm(id, dto, userId);
  }

  @Post(":id/track")
  @HttpCode(HttpStatus.CREATED)
  public trackJob(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TJobPopulated> {
    return this.jobsService.trackJob(id, userId);
  }

  @Patch(":id/track")
  public updateTrackedJob(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrackedJobDto,
    @UserId() userId?: string,
  ): Promise<TJobPopulated> {
    return this.jobsService.updateTrackedJob(id, dto, userId);
  }

  @Get()
  public findAll(
    @Pagination() pagination?: TPagination,
    @SortBy([...JOB_SORTABLE, ...TRACKED_JOB_SORTABLE]) sort?: TSortEntry[],
    @JobsQuery() query?: TJobsQuery,
    @UserId() userId?: string,
  ): Promise<TJobPopulated[]> {
    return this.jobsService.findAll({ userId, query, pagination, sort });
  }

  @Get("discover")
  public discover(
    @Pagination() pagination?: TPagination,
    @SortBy(JOB_SORTABLE) sort?: TSortEntry[],
    @JobsQuery() query?: TJobsQuery,
  ): Promise<TJob[]> {
    return this.jobsService.discover({ query, pagination, sort });
  }

  @Get("from-url")
  public findFromUrl(@Query() query: FindJobByUrlDto): Promise<TJob[]> {
    return this.jobsService.findFromUrl(query.url);
  }

  @Get(":id")
  public findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TJobPopulated> {
    return this.jobsService.findOne(id, userId);
  }

  @Patch(":id")
  public update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @UserId() userId?: string,
  ): Promise<TJobPopulated> {
    return this.jobsService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("force") force?: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.jobsService.delete(
      id,
      userId,
      force === "1" || force === "true",
    );
  }
}
