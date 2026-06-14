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

import { UserId } from "@/src/config/guards/user-id.decorator";
import type {
  TPrepSession,
  TPrepSessionWithQuestions,
  TQuestion,
} from "@/src/database/database.types";

import {
  FindQuestionsDto,
  QuestionDto,
  UpdateQuestionDto,
} from "./dto/question.dto";
import { PrepSessionDto, UpdatePrepSessionDto } from "./dto/session.dto";
import { PrepSessionService } from "./prep-session.service";

@Controller("prep-session")
export class PrepSessionController {
  public constructor(private readonly prepSessionService: PrepSessionService) {}

  @Post()
  public create(
    @Body() dto: PrepSessionDto,
    @UserId() userId?: string,
  ): Promise<TPrepSession> {
    return this.prepSessionService.create(dto, userId);
  }

  @Get()
  public findAll(@UserId() userId?: string): Promise<TPrepSession[]> {
    return this.prepSessionService.findAll(userId);
  }

  @Get(":id")
  public findOne(
    @Param("id") id: string,
    @UserId() userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    return this.prepSessionService.findOne(id, userId);
  }

  @Patch(":id")
  public update(
    @Param("id") id: string,
    @Body() dto: UpdatePrepSessionDto,
    @UserId() userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    return this.prepSessionService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @Param("id") id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.prepSessionService.delete(id, userId);
  }

  @Post(":sessionId/questions")
  public addQuestion(
    @Param("sessionId") sessionId: string,
    @Body() dto: QuestionDto,
    @UserId() userId?: string,
  ): Promise<TQuestion> {
    return this.prepSessionService.addQuestion(sessionId, dto, userId);
  }

  @Get(":sessionId/questions")
  public findQuestions(
    @Param("sessionId") sessionId: string,
    @Query() query: FindQuestionsDto,
    @UserId() userId?: string,
  ): Promise<TQuestion[]> {
    return this.prepSessionService.findQuestions(
      sessionId,
      {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      },
      userId,
    );
  }

  @Patch(":sessionId/questions/:id")
  public updateQuestion(
    @Param("sessionId") sessionId: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionDto,
    @UserId() userId?: string,
  ): Promise<TQuestion> {
    return this.prepSessionService.updateQuestion(id, sessionId, dto, userId);
  }

  @Delete(":sessionId/questions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async removeQuestion(
    @Param("id", ParseIntPipe) id: number,
    @Param("sessionId") sessionId: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.prepSessionService.deleteQuestion(id, sessionId, userId);
  }
}
