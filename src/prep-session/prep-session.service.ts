import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import type {
  TDatabase,
  TPagination,
  TPrepSession,
  TPrepSessionWithQuestions,
  TQuestion,
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

  public async findAll(userId?: string): Promise<TPrepSession[]> {
    const filters = userId
      ? [{ columnName: "userId" as const, value: userId }]
      : [];

    return this.db.findAllByColumn("prep_session", filters);
  }

  public async findOne(
    id: string,
    userId?: string,
  ): Promise<TPrepSessionWithQuestions> {
    return this.db.findById(
      "prep_session",
      id,
      [...(userId ? [{ columnName: "userId" as const, value: userId }] : [])],
      { questions: true },
    ) as Promise<TPrepSessionWithQuestions>;
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
          userId
            ? [
                { columnName: "id", value: id },
                { columnName: "userId", value: userId },
              ]
            : [{ columnName: "id", value: id }],
          transaction,
        );
      }
      if (topicIds) {
        await this.db.delete(
          "session_topics",
          [{ columnName: "sessionId", value: id }],
          true,
          transaction,
        );
        await this._createSessionTopics(id, transaction, topicIds);
      }
    });

    return this.findOne(id, userId);
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("prep_session", [
      { columnName: "id", value: id },
      ...(userId ? [{ columnName: "userId" as const, value: userId }] : []),
    ]);
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
  ): Promise<TQuestion[]> {
    await this.findOne(sessionId, userId);
    return this.db.findAllByColumn(
      "questions",
      [{ columnName: "sessionId", value: sessionId }],
      pagination,
    );
  }

  public async updateQuestion(
    id: number,
    sessionId: string,
    dto: UpdateQuestionDto,
    userId?: string,
  ): Promise<TQuestion> {
    await this.findOne(sessionId, userId);

    const [result] = await this.db.update("questions", dto, [
      { columnName: "id", value: id },
      { columnName: "sessionId", value: sessionId },
    ]);
    return result;
  }

  public async deleteQuestion(
    id: number,
    sessionId: string,
    userId?: string,
  ): Promise<void> {
    await this.findOne(sessionId, userId);
    return this.db.delete("questions", [
      { columnName: "sessionId", value: sessionId },
      { columnName: "id", value: id },
    ]);
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
