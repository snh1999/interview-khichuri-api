import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
} from "@nestjs/common";
import { Observable } from "rxjs";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import { UserId } from "@/src/config/guards/user-id.decorator";
import { SkipEnvelope } from "@/src/config/interceptors/skip-envelope.decorator";
import type {
  TPagination,
  TNote,
  TNoteWithJobTitle,
} from "@/src/database/database.types";

import {
  CreateNoteDto,
  LearnMoreDto,
  ListNotesQuery,
  UpdateNoteDto,
  TLearnMoreResult,
} from "./notes.dto";
import { NotesService } from "./notes.service";

@Controller("notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  create(
    @Body() dto: CreateNoteDto,
    @UserId() userId?: string,
  ): Promise<TNote> {
    return this.notesService.create(dto, userId);
  }

  @Post("learn-more")
  learnMore(@Body() dto: LearnMoreDto): Promise<TLearnMoreResult> {
    return this.notesService.learnMore(dto);
  }

  @Post("learn-more/stream")
  @SkipEnvelope()
  @Sse()
  learnMoreStream(@Body() dto: LearnMoreDto): Observable<MessageEvent> {
    return this.notesService.learnMoreStream(dto);
  }

  @Get()
  findAll(
    @Query() query: ListNotesQuery,
    @Pagination() pagination?: TPagination,
    @UserId() userId?: string,
  ): Promise<TNote[]> {
    return this.notesService.findAll({
      userId,
      query,
      pagination,
    });
  }

  @Get(":id")
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TNoteWithJobTitle> {
    return this.notesService.findById(id, userId);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
    @UserId() userId?: string,
  ): Promise<TNote> {
    return this.notesService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.notesService.delete(id, userId);
  }
}
