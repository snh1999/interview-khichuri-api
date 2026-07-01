import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import { SortBy } from "@/src/config/guards/sort-by.decorator";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { UserId } from "@/src/config/guards/user-id.decorator";
import type {
  TPagination,
  TPrepSession,
  TPrepSessionWithQuestions,
  TQuestion,
} from "@/src/database/database.types";

import {
  CreateQuestionDto,
  UpdateQuestionDto,
  GenerateQuestionsDto,
} from "./dto/question.dto";
import { CreatePrepSessionDto, UpdatePrepSessionDto } from "./dto/session.dto";
import { PrepSessionService } from "./prep-session.service";

@Controller("prep-session")
export class PrepSessionController {
  public constructor(private readonly prepSessionService: PrepSessionService) {}

  @Post()
  public create(
    @Body() dto: CreatePrepSessionDto,
    @UserId() userId?: string,
  ): Promise<TPrepSession> {
    return this.prepSessionService.create(dto, userId);
  }

  @Get()
  public findAll(
    @Pagination() pagination?: TPagination,
    @SortBy(["experience", "description", "createdAt", "updatedAt"])
    sortBy?: TSortEntry[],
    @UserId() userId?: string,
  ): Promise<TPrepSession[]> {
    return this.prepSessionService.findAll(userId, pagination, sortBy);
  }

  @Get(":id")
  public findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    return this.prepSessionService.findOne(id, userId);
  }

  @Patch(":id")
  public update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrepSessionDto,
    @UserId() userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    return this.prepSessionService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.prepSessionService.delete(id, userId);
  }

  @Post(":sessionId/questions")
  public addQuestion(
    @Param("sessionId") sessionId: string,
    @Body() dto: CreateQuestionDto,
    @UserId() userId?: string,
  ): Promise<TQuestion> {
    return this.prepSessionService.addQuestion(sessionId, dto, userId);
  }

  @Post(":id/generate")
  public generateQuestions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GenerateQuestionsDto,
    @UserId() userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    return this.prepSessionService.generateQuestions(id, dto, userId);
  }

  @Get(":sessionId/questions")
  public findQuestions(
    @Param("sessionId") sessionId: string,
    @Pagination() pagination?: TPagination,
    @SortBy(["questionText", "answer", "isFavorite", "createdAt", "updatedAt"])
    sortBy?: TSortEntry[],
    @UserId() userId?: string,
  ): Promise<TQuestion[]> {
    return this.prepSessionService.findQuestions(
      sessionId,
      pagination,
      userId,
      sortBy,
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
