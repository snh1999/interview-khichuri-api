import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { SortBy } from "@/src/config/guards/sort-by.decorator";
import type { ICrawlAiStatus } from "@/src/crawl/crawl.ai";
import type { TJob, TPagination } from "@/src/database/database.types";

import {
  ADMIN_JOB_SORTABLE,
  AdminJobsQuery,
  SetJobDescriptionDto,
  type TAdminJobsQuery,
} from "./admin.dto";
import { AdminService } from "./admin.service";
import type { IAdminJobsResponse } from "./admin.types";

// Refactored from the jobs module so app mode never registers admin-only routes.
@Controller("jobs/admin")
export class AdminJobsController {
  public constructor(private readonly adminService: AdminService) {}

  @Get()
  @Roles(["admin"])
  public findSystemJobs(
    @AdminJobsQuery() query: TAdminJobsQuery,
    @Pagination() pagination?: TPagination,
    @SortBy(ADMIN_JOB_SORTABLE) sort?: TSortEntry[],
  ): Promise<IAdminJobsResponse> {
    return this.adminService.findSystemJobs(query, pagination, sort);
  }

  @Get("failed")
  @Roles(["admin"])
  public findFailedJobs(): Promise<TJob[]> {
    return this.adminService.findFailedJobs();
  }

  @Get("ai-status")
  @Roles(["admin"])
  public getAiStatus(): Promise<ICrawlAiStatus> {
    return this.adminService.getAiStatus();
  }

  @Post("retry-failed")
  @HttpCode(HttpStatus.OK)
  @Roles(["admin"])
  public retryFailedJobs(): Promise<{ count: number }> {
    return this.adminService.retryFailedJobs();
  }

  @Post(":id/retry")
  @HttpCode(HttpStatus.OK)
  @Roles(["admin"])
  public retryFailedJob(@Param("id", ParseUUIDPipe) id: string): Promise<TJob> {
    return this.adminService.retryFailedJob(id);
  }

  @Post(":id/description")
  @HttpCode(HttpStatus.OK)
  @Roles(["admin"])
  public setJobDescription(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetJobDescriptionDto,
  ): Promise<TJob> {
    return this.adminService.setJobDescription(id, dto);
  }
}
