import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import { TRole } from "@/src/database/database.types";
import { CreateLookupDto, UpdateLookupDto } from "@/src/lookups/lookups.dto";

@Injectable()
export class RolesService {
  public constructor(private readonly db: IDatabaseService) {}

  async createRole(dto: CreateLookupDto): Promise<TRole> {
    return this.db.create("roles", dto);
  }

  async findAll(name?: string): Promise<TRole[]> {
    if (name) {
      const result = await this.db.search("roles", ["name"], name);
      return result.data;
    }
    return this.db.findAllByColumn("roles");
  }

  async updateRole(id: number, dto: UpdateLookupDto): Promise<TRole> {
    const result = await this.db.update("roles", dto, [
      { columnName: "id", value: id },
    ]);
    return result[0];
  }

  async deleteRole(id: number): Promise<void> {
    return this.db.delete("roles", [{ columnName: "id", value: id }]);
  }
}
