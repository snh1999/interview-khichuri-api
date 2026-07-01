import { Injectable } from "@nestjs/common";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { IDatabaseService } from "@/src/database/database.service";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";

import type {
  CreateJobDto,
  UpdateJobDto,
  ExtractJobDto,
  TJobExtractionResult,
} from "./jobs.dto";
import type {
  TDatabase,
  TJob,
  TJobWithTopics,
  TPagination,
  TSortBy,
} from "../database/database.types";

@Injectable()
export class JobsService {
  public constructor(
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
    private readonly lookupsService: LookupsService,
  ) {}

  public async create(dto: CreateJobDto, userId?: string): Promise<TJob> {
    const { topicIds, topicNames, deadline, interviewDate, ...data } = dto;

    return this.db.withTransaction(async (transaction) => {
      const job = await this.db.create(
        "jobs",
        {
          ...data,
          userId,
          deadline: deadline ? new Date(deadline) : null,
          interviewDate: interviewDate ? new Date(interviewDate) : null,
        },
        transaction,
      );
      await this._createJobTopics(job.id, transaction, topicIds, topicNames);
      return job;
    });
  }

  public async extractJob(dto: ExtractJobDto): Promise<TJobExtractionResult> {
    const extracted = await this.genAiService.extractJob({
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...dto,
    });

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

  public async findAll(
    userId?: string,
    search?: string,
    pagination?: TPagination,
    sortBy?: TSortEntry[],
  ): Promise<TJob[]> {
    const filters = userId ? { userId } : {};
    const sort = sortBy?.length
      ? sortBy
      : [{ column: "createdAt", order: "desc" as const }];

    if (search) {
      const result = await this.db.search(
        "jobs",
        ["title", "description"],
        search,
        {
          filter: filters,
          pagination,
        },
      );
      return result.data;
    }

    return this.db.findAllByColumn("jobs", {
      filter: filters,
      sortBy: sort as TSortBy<"jobs">[],
      pagination,
    });
  }

  public async findOne(
    id: string,
    userId?: string,
    populate = true,
  ): Promise<TJobWithTopics> {
    return this.db.findById("jobs", id, {
      filter: { ...(userId ? { userId } : {}) },
      relation: populate ? { jobTopics: { with: { topic: true } } } : undefined,
    }) as Promise<TJobWithTopics>;
  }

  public async update(
    id: string,
    dto: UpdateJobDto,
    userId?: string,
  ): Promise<TJobWithTopics> {
    const { topicIds, topicNames, deadline, interviewDate, ...data } = dto;
    const jobFields: Record<string, unknown> = {
      ...data,
      deadline: deadline ? new Date(deadline) : undefined,
      interviewDate: interviewDate ? new Date(interviewDate) : undefined,
    };

    await this.db.withTransaction(async (transaction) => {
      if (Object.keys(jobFields).length > 0) {
        await this.db.update(
          "jobs",
          jobFields,
          userId ? { id, userId } : { id },
          transaction,
        );
      }
      await this._createJobTopics(id, transaction, topicIds, topicNames);
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
    topicNames?: string[],
  ) {
    if (!topicNames && !topicIds) return;

    const resolvedTopicNames = await this.lookupsService.resolveOrCreateNames(
      "topics",
      topicNames,
    );
    const allTopicIds = [
      ...new Set([...(topicIds ?? []), ...resolvedTopicNames]),
    ];

    await this.db.syncJunctionTable(
      "job_topics",
      { column: "jobId", value: jobId },
      "topicId",
      allTopicIds,
      transaction,
    );
  }
}
