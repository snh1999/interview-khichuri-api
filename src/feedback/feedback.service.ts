import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  type InferSelectModel,
  type SQL,
} from "drizzle-orm";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { DATABASE_CONNECTION } from "@/src/database/database.constants";
import type { TPagination } from "@/src/database/database.types";
import type { TdbPostgres } from "@/src/database/postgres/postgres.service";
import { feedback } from "@/src/database/postgres/schemas";

import { CreateFeedbackDto, TAdminFeedbackQuery } from "./feedback.dto";
import type { IAdminFeedback, IAdminFeedbackResponse } from "./feedback.types";

const DEFAULT_PAGE_LIMIT = 20;

const FEEDBACK_SORT_COLUMNS = {
  createdAt: feedback.createdAt,
  updatedAt: feedback.updatedAt,
  type: feedback.type,
  status: feedback.status,
} as const;

type TFeedbackRow = InferSelectModel<typeof feedback>;

@Injectable()
export class FeedbackService {
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly pg: TdbPostgres,
    private readonly config: ConfigService,
  ) {}

  public async createReport(
    dto: CreateFeedbackDto,
    userId?: string,
    userAgent?: string,
  ): Promise<IAdminFeedback> {
    const [row] = await this.pg
      .insert(feedback)
      .values({
        type: dto.type,
        message: dto.message,
        route: dto.route,
        userAgent: userAgent ?? null,
        userId: userId ?? null,
      })
      .returning();
    return toAdminFeedback(row);
  }

  public async findAll(
    query: TAdminFeedbackQuery,
    pagination?: TPagination,
    sort?: TSortEntry[],
  ): Promise<IAdminFeedbackResponse> {
    const conditions = buildFeedbackConditions(query);
    const where = conditions.length ? and(...conditions) : undefined;
    const orderBy = sort?.length
      ? sort.map(orderFeedbackColumn)
      : [desc(feedback.createdAt)];

    const [rows, total] = await Promise.all([
      this.pg
        .select()
        .from(feedback)
        .where(where)
        .orderBy(...orderBy)
        .limit(pagination?.limit ?? DEFAULT_PAGE_LIMIT)
        .offset(pagination?.offset ?? 0),
      this.pg.$count(feedback, where),
    ]);

    return { items: rows.map(toAdminFeedback), total };
  }

  public async updateStatus(
    id: string,
    status: string | null,
  ): Promise<IAdminFeedback> {
    const rows = await this.pg
      .update(feedback)
      .set({ status })
      .where(eq(feedback.id, id))
      .returning();
    if (rows.length === 0) {
      throw new NotFoundException(`Feedback ${id} not found`);
    }
    return toAdminFeedback(rows[0]);
  }

  public async remove(id: string): Promise<void> {
    const deleted = await this.pg
      .delete(feedback)
      .where(eq(feedback.id, id))
      .returning();
    if (deleted.length === 0) {
      throw new NotFoundException(`Feedback ${id} not found`);
    }
  }
}

function buildFeedbackConditions(query: TAdminFeedbackQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.type) {
    conditions.push(eq(feedback.type, query.type));
  }
  if (query.status === "unset") {
    conditions.push(isNull(feedback.status));
  } else if (query.status) {
    conditions.push(eq(feedback.status, query.status));
  }
  if (query.q) {
    const pattern = `%${query.q}%`;
    const search = or(
      ilike(feedback.message, pattern),
      ilike(feedback.route, pattern),
    );
    if (search) conditions.push(search);
  }

  return conditions;
}

function orderFeedbackColumn(entry: TSortEntry): SQL {
  const key = entry.column as keyof typeof FEEDBACK_SORT_COLUMNS;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const column = FEEDBACK_SORT_COLUMNS[key] ?? feedback.createdAt;
  return entry.order === "desc" ? desc(column) : asc(column);
}

function toAdminFeedback(row: TFeedbackRow): IAdminFeedback {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    route: row.route,
    userAgent: row.userAgent,
    status: row.status,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
