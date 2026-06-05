import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";

import type { CreateJobDto, UpdateJobDto } from "./jobs.dto";
import { TJob } from "../database/database.types";

@Injectable()
export class JobsService {
  public constructor(private readonly db: IDatabaseService) {}

  public async create(dto: CreateJobDto, userId?: string): Promise<TJob> {
    const { title, description, status, roleId, deadline } = dto;

    return this.db.create("jobs", {
      userId,
      title,
      description,
      status,
      roleId: roleId ?? null,
      deadline: deadline ? new Date(deadline) : null,
    });
  }

  public async findAll(userId?: string): Promise<TJob[]> {
    return this.db.findAllByColumn("jobs", [
      ...(userId ? [{ columnName: "userId", value: userId } as const] : []),
    ]);
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
    return this.db.update("jobs", dto, [
      { columnName: "id", value: id },
      ...(userId ? [{ columnName: "userId", value: userId } as const] : []),
    ]);
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("jobs", [
      { columnName: "id", value: id },
      ...(userId ? [{ columnName: "userId", value: userId } as const] : []),
    ]);
  }
}
