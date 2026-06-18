import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import type { CreateJobDto, UpdateJobDto } from "./jobs.dto";
import type {
  TDatabase,
  TJob,
  TJobWithTopics,
  TPagination,
} from "../database/database.types";
import type { TSortBy } from "../database/database.types";

@Injectable()
export class JobsService {
  public constructor(private readonly db: IDatabaseService) {}

  public async create(dto: CreateJobDto, userId?: string): Promise<TJob> {
    const { topicIds, deadline, ...data } = dto;
    const newJob = {
      ...data,
      userId,
      deadline: deadline ? new Date(deadline) : null,
    };

    return this.db.withTransaction(async (transaction) => {
      const job = await this.db.create("jobs", newJob, transaction);
      await this._createJobTopics(job.id, transaction, topicIds);
      return job;
    });
  }

  private async _createJobTopics(
    jobId: string,
    transaction: TDatabase,
    topicIds?: number[],
  ) {
    if (topicIds?.length) {
      const uniqueTopicIds = [...new Set(topicIds)];
      const jobTopics = uniqueTopicIds.map((topicId) => ({
        jobId: jobId,
        topicId,
      }));
      await this.db.createMany("job_topics", jobTopics, transaction);
    }
  }

  public async findAll(
    userId?: string,
    search?: string,
    pagination?: TPagination,
    sortBy?: TSortEntry[],
  ): Promise<TJob[]> {
    const filters = userId ? { userId } : {};
    const sort = sortBy?.length ? sortBy : [{ columnName: "createdAt", order: "desc" as const }];

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

    return this.db.findAllByColumn("jobs", { filter: filters, sortBy: sort as TSortBy<"jobs">[], pagination });
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
    const { topicIds, ...jobFields } = dto;

    await this.db.withTransaction(async (transaction) => {
      if (Object.keys(jobFields).length > 0) {
        await this.db.update(
          "jobs",
          jobFields,
          userId ? { id, userId } : { id },
          transaction,
        );
      }
      if (topicIds) {
        await this.db.delete("job_topics", { jobId: id }, true, transaction);
        await this._createJobTopics(id, transaction, topicIds);
      }
    });

    return this.findOne(id, userId);
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("jobs", {
      id,
      ...(userId ? { userId } : {}),
    });
  }
}
