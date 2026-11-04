import { ConflictException, Injectable } from "@nestjs/common";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { IDatabaseService } from "@/src/database/database.service";
import type {
  TCompany,
  TPagination,
  TSortBy,
} from "@/src/database/database.types";

import { CreateCompanyDto, UpdateCompanyDto } from "./dto/company.dto";

@Injectable()
export class CompanyService {
  public constructor(private readonly db: IDatabaseService) {}

  public async create(dto: CreateCompanyDto): Promise<TCompany> {
    return this.db.create("companies", dto);
  }

  public async findById(id: number): Promise<TCompany> {
    return this.db.findById("companies", id);
  }

  public async findAll(
    name?: string,
    pagination?: TPagination,
    sortBy?: TSortEntry[],
  ): Promise<TCompany[]> {
    if (name) {
      const result = await this.db.search("companies", ["name"], name);
      return result.data;
    }
    return this.db.findAllByColumn("companies", {
      pagination,
      sortBy: sortBy as TSortBy<"companies">[],
    });
  }

  public async update(id: number, dto: UpdateCompanyDto): Promise<TCompany> {
    const [company] = await this.db.update("companies", dto, { id });
    return company;
  }

  public async delete(id: number): Promise<void> {
    const systemJobs = await this.db.findAllByColumn("jobs", {
      filter: { companyId: id, userId: null },
    });
    const tracks = systemJobs.length
      ? await this.db.findAllByColumn("tracked_jobs", {
          filter: { jobId: systemJobs.map((job) => job.id) },
        })
      : [];

    if (tracks.length > 0) {
      throw new ConflictException({
        code: "COMPANY_HAS_TRACKED_JOBS",
        message: `This company has ${tracks.length} tracked jobs`,
        trackedJobCount: tracks.length,
        trackedUserCount: new Set(tracks.map((track) => track.userId)).size,
      });
    }

    await this.db.withTransaction(async (transaction) => {
      // Private jobs detach through the company FK's SET NULL.
      await this.db.delete(
        "jobs",
        { companyId: id, userId: null },
        true,
        transaction,
      );
      await this.db.delete("companies", { id }, false, transaction);
    });
  }
}
