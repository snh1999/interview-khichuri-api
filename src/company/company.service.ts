import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import type { TCompany } from "@/src/database/database.types";

import { CreateCompanyDto, UpdateCompanyDto } from "./dto/company.dto";

@Injectable()
export class CompanyService {
  public constructor(private readonly db: IDatabaseService) {}

  public async create(dto: CreateCompanyDto): Promise<TCompany> {
    return this.db.create("companies", dto);
  }

  public async findAll(name?: string): Promise<TCompany[]> {
    if (name) {
      const result = await this.db.search("companies", ["name"], name);
      return result.data;
    }
    return this.db.findAllByColumn("companies");
  }

  public async update(id: number, dto: UpdateCompanyDto): Promise<TCompany> {
    const [company] = await this.db.update("companies", dto, [
      { columnName: "id", value: id },
    ]);
    return company;
  }

  public async delete(id: number): Promise<void> {
    await this.db.delete("companies", [{ columnName: "id", value: id }]);
  }
}
