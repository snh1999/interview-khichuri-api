import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import { UserId } from "@/src/config/guards/user-id.decorator";
import { TJob } from "@/src/database/database.types";

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
  public findAll(@UserId() userId?: string): Promise<TJob[]> {
    return this.jobsService.findAll(userId);
  }

  @Get(":id")
  public findOne(
    @Param("id") id: string,
    @UserId() userId?: string,
  ): Promise<TJob> {
    return this.jobsService.findOne(id, userId);
  }

  @Patch(":id")
  public update(
    @Param("id") id: string,
    @Body() dto: UpdateJobDto,
    @UserId() userId?: string,
  ): Promise<TJob> {
    return this.jobsService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @Param("id") id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.jobsService.delete(id, userId);
  }
}
