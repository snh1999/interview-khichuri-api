import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { AllowAnonymous, Roles } from "@thallesp/nestjs-better-auth";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import { SortBy } from "@/src/config/guards/sort-by.decorator";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { UserId } from "@/src/config/guards/user-id.decorator";
import type { TPagination } from "@/src/database/database.types";

import {
  ADMIN_FEEDBACK_SORTABLE,
  AdminFeedbackQuery,
  CreateFeedbackDto,
  type TAdminFeedbackQuery,
  UpdateFeedbackStatusDto,
} from "./feedback.dto";
import { FeedbackService } from "./feedback.service";
import type { IAdminFeedback, IAdminFeedbackResponse } from "./feedback.types";

@Controller("feedback")
export class FeedbackController {
  public constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @AllowAnonymous()
  public create(
    @Body() dto: CreateFeedbackDto,
    @UserId() userId?: string,
    @Headers("user-agent") userAgent?: string,
  ): Promise<IAdminFeedback> {
    return this.feedbackService.createBugReport(dto, userId, userAgent);
  }
}

@Controller("admin/feedback")
export class AdminFeedbackController {
  public constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @Roles(["admin"])
  public findAll(
    @AdminFeedbackQuery() query: TAdminFeedbackQuery,
    @Pagination() pagination?: TPagination,
    @SortBy(ADMIN_FEEDBACK_SORTABLE) sort?: TSortEntry[],
  ): Promise<IAdminFeedbackResponse> {
    return this.feedbackService.findAll(query, pagination, sort);
  }

  @Patch(":id")
  @Roles(["admin"])
  public updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ): Promise<IAdminFeedback> {
    return this.feedbackService.updateStatus(id, dto.status);
  }

  @Delete(":id")
  @Roles(["admin"])
  @HttpCode(HttpStatus.NO_CONTENT)
  public remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.feedbackService.remove(id);
  }
}
