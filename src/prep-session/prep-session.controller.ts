import {
  Body,
  Controller,
  DefaultValuePipe,
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

import { QuestionDto, UpdateQuestionDto } from "./dto/question.dto";
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
  ): Promise<TQuestion> {
    return this.prepSessionService.addQuestion(sessionId, dto);
  }

  @Get(":sessionId/questions")
  public findQuestions(
    @Param("sessionId") sessionId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<TQuestion[]> {
    return this.prepSessionService.findQuestions(sessionId, {
      offset: (page - 1) * limit,
      limit,
    });
  }

  @Patch("questions/:id")
  public updateQuestion(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionDto,
  ): Promise<TQuestion> {
    return this.prepSessionService.updateQuestion(id, dto);
  }

  @Delete("questions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async removeQuestion(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    await this.prepSessionService.deleteQuestion(id);
  }
}
