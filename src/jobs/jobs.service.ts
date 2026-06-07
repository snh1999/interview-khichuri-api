import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";

import type { CreateJobDto, UpdateJobDto } from "./jobs.dto";
import type {
  TDatabase,
  TJob,
  TJobWithTopics,
} from "../database/database.types";

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
      const jobTopics = topicIds.map((topicId) => ({
        jobId: jobId,
        topicId,
      }));
      await this.db.createMany("job_topics", jobTopics, transaction);
    }
  }

  public async findAll(userId?: string, search?: string): Promise<TJob[]> {
    const filters = userId
      ? [{ columnName: "userId" as const, value: userId }]
      : [];

    if (search) {
      const result = await this.db.search(
        "jobs",
        ["title", "description"],
        search,
        filters,
      );
      return result.data;
    }

    return this.db.findAllByColumn("jobs", filters);
  }

  public async findOne(
    id: string,
    userId?: string,
    populate = true,
  ): Promise<TJobWithTopics> {
    return this.db.findById(
      "jobs",
      id,
      [...(userId ? [{ columnName: "userId", value: userId } as const] : [])],
      populate ? { jobTopics: { with: { topic: true } } } : undefined,
    ) as Promise<TJobWithTopics>;
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
          userId
            ? [
                { columnName: "id" as const, value: id },
                { columnName: "userId" as const, value: userId },
              ]
            : [{ columnName: "id" as const, value: id }],
          transaction,
        );
      }
      if (topicIds) {
        await this.db.delete(
          "job_topics",
          [{ columnName: "jobId", value: id }],
          true,
          transaction,
        );
        await this._createJobTopics(id, transaction, topicIds);
      }
    });

    return this.findOne(id, userId);
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("jobs", [
      { columnName: "id", value: id },
      ...(userId ? [{ columnName: "userId", value: userId } as const] : []),
    ]);
  }
}
