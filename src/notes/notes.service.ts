import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import {
  TNote,
  TNoteWithJobTitle,
  TPagination,
  TQuestion,
  TSortBy,
} from "@/src/database/database.types";
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

type TNoteWithJobRelation = TNote & { job: { title: string | null } | null };
type TQuestionWithSession = TQuestion & {
  session: { userId: string | null } | null;
};

@Injectable()
export class NotesService {
  constructor(
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
  ) {}

  async create(dto: CreateNoteDto, userId?: string): Promise<TNote> {
    if (dto.questionId && dto.jobId) {
      throw new BadRequestException(
        "A note can only be linked to one question or job.",
      );
    }

    const user = userId ? { userId } : {};

    if (dto.jobId) {
      await this.db.findById("jobs", dto.jobId, { filter: user });
    }

    if (dto.questionId) {
      const question = (await this.db.findById("questions", dto.questionId, {
        relation: { session: { columns: { userId: true } } },
      })) as unknown as TQuestionWithSession;

      if (userId && question.session?.userId !== userId) {
        throw new ForbiddenException("Question not found");
      }
    }

    return this.db.create("notes", {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...dto,
      ...user,
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

  async findById(id: string, userId?: string): Promise<TNoteWithJobTitle> {
    const note = (await this.db.findById("notes", id, {
      relation: { job: { columns: { title: true } } },
    })) as unknown as TNoteWithJobRelation;

    if (userId && note.userId !== userId) {
      throw new ForbiddenException("You can only access your own notes");
    }

    const { job, ...rest } = note;
    return { ...rest, jobTitle: job?.title ?? undefined };
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

  async learnMore(dto: LearnMoreDto): Promise<TLearnMoreResult> {
    const { questionText, provider, model } = dto;
    const prompt = `${EXPLAIN_INTERVIEW_QUESTION_PROMPT}${questionText}`;

    return this.genAiService.generateStructured(
      prompt,
      markdownSchema,
      provider,
      { model },
    );
  }
}
