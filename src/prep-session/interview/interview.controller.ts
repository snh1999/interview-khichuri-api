import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";

import { UserId } from "@/src/config/guards/user-id.decorator";
import { TInterview } from "@/src/database/database.types";
import { InterviewService } from "@/src/prep-session/interview/interview.service";

import {
  CompleteInterviewDto,
  CreateInterviewDto,
  FollowUpDto,
  IInterviewWithQuestions,
  TInterviewQuestion,
} from "../dto/interview.dto";

@Controller("interviews")
export class InterviewController {
  public constructor(private readonly interviewService: InterviewService) {}

  @Post()
  public create(
    @Body() dto: CreateInterviewDto,
    @UserId() userId?: string,
  ): Promise<IInterviewWithQuestions> {
    return this.interviewService.create(dto, userId);
  }

  @Post(":id/complete")
  public complete(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CompleteInterviewDto,
    @UserId() userId?: string,
  ): Promise<TInterview> {
    return this.interviewService.complete(id, dto, userId);
  }

  @Post(":id/follow-ups")
  public followUps(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FollowUpDto,
    @UserId() userId?: string,
  ): Promise<TInterviewQuestion[]> {
    return this.interviewService.followUps(id, dto, userId);
  }

  @Get(":id")
  public findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TInterview> {
    return this.interviewService.findById(id, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.interviewService.remove(id, userId);
  }

  @Get()
  public findBySession(
    @Query("sessionId", ParseUUIDPipe) sessionId: string,
    @UserId() userId?: string,
  ): Promise<TInterview[]> {
    return this.interviewService.findBySession(sessionId, userId);
  }
}
