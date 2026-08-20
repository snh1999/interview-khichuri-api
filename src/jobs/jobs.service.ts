import { ConflictException, Injectable } from "@nestjs/common";

import type { TJobsQuery } from "@/src/config/guards/jobs-query.decorator";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { IDatabaseService } from "@/src/database/database.service";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";

import {
  CreateJobDto,
  UpdateJobDto,
  ExtractJobDto,
  TJobExtractionResult,
  TJobWithTopicIds,
} from "./jobs.dto";
import type {
  TDatabase,
  TJob,
  TJobWithTopics,
  TPagination,
  TSortBy,
  TDateRangeOption,
} from "../database/database.types";

const MAX_JOBS_PER_USER = 200;

@Injectable()
export class JobsService {
  public constructor(
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
    private readonly lookupsService: LookupsService,
  ) {}

  public async create(dto: CreateJobDto, userId?: string): Promise<TJob> {
    if (userId) {
      const existing = await this.db.findAllByColumn("jobs", {
        filter: { userId },
      });
      if (existing.length >= MAX_JOBS_PER_USER) {
        throw new ConflictException(
          `You can only have up to ${MAX_JOBS_PER_USER} jobs`,
        );
      }
    }

    const { topicIds, ...data } = dto;

    return this.db.withTransaction(async (transaction) => {
      const job = await this.db.create(
        "jobs",
        { ...data, userId },
        transaction,
      );
      await this._createJobTopics(job.id, transaction, topicIds);
      return job;
    });
  }

  public async extractJob(dto: ExtractJobDto): Promise<TJobExtractionResult> {
    const extracted = await this.genAiService.extractJob(dto);

    const [roleId, topicIds] = await Promise.all([
      this.lookupsService.resolveOrCreateName("roles", extracted.roleName),
      this.lookupsService.resolveOrCreateNames("topics", extracted.topicNames),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...extracted,
      roleId,
      topicIds,
    };
  }

  public async findAll({
    userId,
    query,
    pagination,
    sort,
  }: {
    userId?: string;
    query?: TJobsQuery;
    pagination?: TPagination;
    sort?: TSortEntry[];
  }): Promise<TJob[]> {
    const { search, status, dateFilter: dateFilters } = query ?? {};

    const sortBy = [
      { column: "isFavorite", order: "desc" as const },
      ...(sort ?? []),
      { column: "createdAt", order: "desc" as const },
    ] as TSortBy<"jobs">[];

    const dateRanges: TDateRangeOption<"jobs">[] = dateFilters
      ? dateFilters.map(({ type, from, to }) => ({
          column:
            type === "interview"
              ? "interviewDate"
              : type === "applied"
                ? "appliedAt"
                : "deadline",
          range: { from, to },
        }))
      : [];
    const filter = {
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
    };

    if (search) {
      const result = await this.db.search(
        "jobs",
        ["title", "description"],
        search,
        { filter, pagination },
      );

      if (dateRanges.length === 0) {
        return result.data;
      }

      const allJobs = await this.db.findAllByColumn("jobs", {
        filter,
        sortBy,
        dateRanges,
      });

      const searchIds = new Set(result.data.map((j: TJob) => j.id));
      return allJobs.filter((j: TJob) => searchIds.has(j.id));
    }

    return this.db.findAllByColumn("jobs", {
      filter,
      sortBy,
      pagination,
      ...(dateRanges.length > 0 && { dateRanges }),
    });
  }

  public async findOne(
    id: string,
    userId?: string,
    populate = true,
  ): Promise<TJobWithTopicIds> {
    const job = (await this.db.findById("jobs", id, {
      filter: { ...(userId ? { userId } : {}) },
      relation: populate ? { jobTopics: true } : undefined,
    })) as TJobWithTopics;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const topicIds = (job.jobTopics ?? []).map((jt) => jt.topicId);

    return {
      ...job,
      topicIds,
    };
  }

  public async update(
    id: string,
    dto: UpdateJobDto,
    userId?: string,
  ): Promise<TJob> {
    const { topicIds, ...data } = dto;

    await this.db.withTransaction(async (transaction) => {
      if (Object.keys(data).length > 0) {
        await this.db.update(
          "jobs",
          data,
          userId ? { id, userId } : { id },
          transaction,
        );
      }
      await this._createJobTopics(id, transaction, topicIds);
    });

    return this.findOne(id, userId);
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("jobs", {
      id,
      ...(userId ? { userId } : {}),
    });
  }

  private async _createJobTopics(
    jobId: string,
    transaction: TDatabase,
    topicIds?: number[],
  ) {
    if (!topicIds) return;

    await this.db.syncJunctionTable(
      "job_topics",
      { column: "jobId", value: jobId },
      "topicId",
      topicIds,
      transaction,
    );
  }
}
