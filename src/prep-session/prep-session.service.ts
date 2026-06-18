import { Injectable } from "@nestjs/common";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { IDatabaseService } from "@/src/database/database.service";
import type {
  TDatabase,
  TPagination,
  TPrepSession,
  TPrepSessionWithQuestions,
  TQuestion,
  TSortBy,
} from "@/src/database/database.types";

import { CreateQuestionDto, UpdateQuestionDto } from "./dto/question.dto";
import type { PrepSessionDto, UpdatePrepSessionDto } from "./dto/session.dto";

@Injectable()
export class PrepSessionService {
  public constructor(private readonly db: IDatabaseService) {}

  public async create(
    dto: PrepSessionDto,
    userId?: string,
  ): Promise<TPrepSession> {
    const { topicIds, ...data } = dto;

    return this.db.withTransaction(async (transaction) => {
      const session = await this.db.create(
        "prep_session",
        { ...data, userId },
        transaction,
      );
      await this._createSessionTopics(session.id, transaction, topicIds);
      return session;
    });
  }

  public async findAll(
    userId?: string,
    pagination?: TPagination,
    sortBy?: TSortEntry[],
  ): Promise<TPrepSession[]> {
    const sort = sortBy?.length
      ? sortBy
      : [{ column: "createdAt", order: "desc" as const }];
    return this.db.findAllByColumn("prep_session", {
      filter: userId ? { userId } : {},
      pagination,
      sortBy: sort as TSortBy<"prep_session">[],
    });
  }

  public async findOne(
    id: string,
    userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    return this.db.findById("prep_session", id, {
      filter: { ...(userId ? { userId } : {}) },
      relation: { questions: true },
    }) as Promise<TPrepSessionWithQuestions>;
  }

  public async update(
    id: string,
    dto: UpdatePrepSessionDto,
    userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    const { topicIds, ...sessionFields } = dto;

    await this.db.withTransaction(async (transaction) => {
      if (Object.keys(sessionFields).length > 0) {
        await this.db.update(
          "prep_session",
          sessionFields,
          userId ? { id, userId } : { id },
          transaction,
        );
      }
      if (topicIds) {
        await this.db.delete(
          "session_topics",
          { sessionId: id },
          true,
          transaction,
        );
        await this._createSessionTopics(id, transaction, topicIds);
      }
    });

    return this.findOne(id, userId);
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("prep_session", {
      id,
      ...(userId ? { userId } : {}),
    });
  }

  public async addQuestion(
    sessionId: string,
    dto: CreateQuestionDto,
    userId?: string,
  ): Promise<TQuestion> {
    await this.findOne(sessionId, userId);
    // eslint-disable-next-line @typescript-eslint/no-misused-spread
    return this.db.create("questions", { ...dto, sessionId });
  }

  public async findQuestions(
    sessionId: string,
    pagination?: TPagination,
    userId?: string,
    sortBy?: TSortEntry[],
  ): Promise<TQuestion[]> {
    await this.findOne(sessionId, userId);
    const sort = sortBy?.length
      ? sortBy
      : [{ column: "createdAt", order: "desc" as const }];
    return this.db.findAllByColumn("questions", {
      filter: { sessionId },
      sortBy: sort as TSortBy<"questions">[],
      pagination,
    });
  }

  public async updateQuestion(
    id: number,
    sessionId: string,
    dto: UpdateQuestionDto,
    userId?: string,
  ): Promise<TQuestion> {
    await this.findOne(sessionId, userId);

    const [result] = await this.db.update("questions", dto, { id, sessionId });
    return result;
  }

  public async deleteQuestion(
    id: number,
    sessionId: string,
    userId?: string,
  ): Promise<void> {
    await this.findOne(sessionId, userId);
    return this.db.delete("questions", { sessionId, id });
  }

  private async _createSessionTopics(
    sessionId: string,
    transaction: TDatabase,
    topicIds?: number[],
  ): Promise<void> {
    if (topicIds?.length) {
      const sessionTopics = topicIds.map((topicId) => ({
        sessionId,
        topicId,
      }));
      await this.db.createMany("session_topics", sessionTopics, transaction);
    }
  }
}
