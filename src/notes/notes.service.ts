import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
} from "@nestjs/common";
import { Observable } from "rxjs";

import { createSseStream } from "@/src/common/create-stream";
import { IDatabaseService } from "@/src/database/database.service";
import { TNote, TPagination, TSortBy } from "@/src/database/database.types";
import { EXPLAIN_INTERVIEW_QUESTION_PROMPT } from "@/src/gen-ai/gen-ai.constants";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";

import {
  CreateNoteDto,
  TLearnMoreResult,
  LearnMoreDto,
  ListNotesQuery,
  markdownSchema,
  UpdateNoteDto,
} from "./notes.dto";

@Injectable()
export class NotesService {
  constructor(
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
  ) {}

  async create(dto: CreateNoteDto, userId?: string): Promise<TNote> {
    return this.db.create("notes", {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...dto,
      ...(userId ? { userId } : {}),
    });
  }

  async findAll({
    userId,
    query,
    pagination,
    sortBy,
  }: {
    userId?: string;
    query?: ListNotesQuery;
    pagination?: TPagination;
    sortBy?: { column: string; order?: "asc" | "desc" }[];
  }): Promise<TNote[]> {
    const { isFavorite, search } = query ?? {};

    const filter = {
      ...(userId ? { userId } : {}),
      ...(isFavorite !== undefined ? { isFavorite } : {}),
    };

    const sort = [
      { column: "isFavorite", order: "desc" as const },
      ...(sortBy ?? []),
      { column: "createdAt", order: "desc" as const },
    ];

    if (search) {
      return (
        await this.db.search("notes", ["title", "details"], search, {
          filter,
          pagination,
        })
      ).data;
    }

    return this.db.findAllByColumn("notes", {
      filter,
      sortBy: sort as TSortBy<"notes">[],
      pagination,
    });
  }

  async findById(id: string, userId?: string): Promise<TNote> {
    const note = await this.db.findById("notes", id);

    if (userId && note.userId !== userId) {
      throw new ForbiddenException("You can only access your own notes");
    }

    return note;
  }

  async update(
    id: string,
    dto: UpdateNoteDto,
    userId?: string,
  ): Promise<TNote> {
    const note = await this.db.findById("notes", id);
    if (userId && note.userId !== userId) {
      throw new ForbiddenException("You can only update your own notes");
    }

    const [updated] = await this.db.update("notes", dto, { id });
    return updated;
  }

  async delete(id: string, userId?: string): Promise<void> {
    const note = await this.db.findById("notes", id);
    if (userId && note.userId !== userId) {
      throw new ForbiddenException("You can only delete your own notes");
    }

    await this.db.delete("notes", { id });
  }

  async learnMore(
    { questionText, ...options }: LearnMoreDto,
    userId?: string,
  ): Promise<TLearnMoreResult> {
    const prompt = `${EXPLAIN_INTERVIEW_QUESTION_PROMPT}${questionText}`;

    return this.genAiService.generateStructured({
      prompt,
      schema: markdownSchema,
      userId,
      ...options,
    });
  }

  learnMoreStream(
    dto: LearnMoreDto,
    userId?: string,
  ): Observable<MessageEvent> {
    const { questionText, provider, model, instruction } = dto;
    const prompt = `${EXPLAIN_INTERVIEW_QUESTION_PROMPT}${questionText}`;

    return createSseStream({
      getSource: (signal) =>
        this.genAiService.streamMarkdown({
          prompt,
          provider,
          model,
          instruction,
          abortSignal: signal,
          userId,
        }),
      mapChunk: (text) => ({ type: "text", text }),
      getErrorMessage: (error) =>
        error instanceof BadRequestException
          ? error.message
          : "Could not generate explanation",
    });
  }
}
