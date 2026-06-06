import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";

import type { CreateJobDto, UpdateJobDto } from "./jobs.dto";
import { TJob } from "../database/database.types";

@Injectable()
export class JobsService {
  public constructor(private readonly db: IDatabaseService) {}

  public async create(dto: CreateJobDto, userId?: string): Promise<TJob> {
    const { title, description, status, roleId, topicId, deadline } = dto;

    return this.db.create("jobs", {
      userId,
      title,
      description,
      status,
      roleId: roleId ?? null,
      topicId: topicId ?? null,
      deadline: deadline ? new Date(deadline) : null,
    });
  }

  public async findAll(userId?: string, search?: string): Promise<TJob[]> {
    const filters = userId
      ? [{ columnName: "userId" as const, value: userId }]
      : [];

    if (search) {
      const result = await this.db.search("jobs", ["title", "description"], search, filters);
      return result.data;
    }

    return this.db.findAllByColumn("jobs", filters);
  }

  public async findOne(id: string, userId?: string): Promise<TJob> {
    return this.db.findById("jobs", id, [
      ...(userId ? [{ columnName: "userId", value: userId } as const] : []),
    ]);
  }

  public async update(
    id: string,
    dto: UpdateJobDto,
    userId?: string,
  ): Promise<TJob> {
    const result = await this.db.update("jobs", dto, [
      { columnName: "id", value: id },
      ...(userId ? [{ columnName: "userId", value: userId } as const] : []),
    ]);

    return result[0];
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("jobs", [
      { columnName: "id", value: id },
      ...(userId ? [{ columnName: "userId", value: userId } as const] : []),
    ]);
  }
}
