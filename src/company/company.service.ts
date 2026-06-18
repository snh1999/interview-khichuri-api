import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import type { TCompany, TPagination, TSortBy } from "@/src/database/database.types";

import { CreateCompanyDto, UpdateCompanyDto } from "./dto/company.dto";

@Injectable()
export class CompanyService {
  public constructor(private readonly db: IDatabaseService) {}

  public async create(dto: CreateCompanyDto): Promise<TCompany> {
    return this.db.create("companies", dto);
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
    return this.db.findAllByColumn("companies", { pagination, sortBy: sortBy as TSortBy<"companies">[] });
  }

  public async update(id: number, dto: UpdateCompanyDto): Promise<TCompany> {
    const [company] = await this.db.update("companies", dto, { id });
    return company;
  }

  public async delete(id: number): Promise<void> {
    await this.db.delete("companies", { id });
  }
}
