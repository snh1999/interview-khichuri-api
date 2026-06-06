import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import { TRole } from "@/src/database/database.types";
import { CreateRoleDto, UpdateRoleDto } from "@/src/lookups/dto/roles.dto";

@Injectable()
export class LookupsService {
  public constructor(private readonly db: IDatabaseService) {}

  async createRole(dto: CreateRoleDto): Promise<TRole> {
    return this.db.create("roles", dto);
  }

  async findAll(): Promise<TRole[]> {
    return this.db.findAllByColumn("roles");
  }

  async updateRole(id: number, dto: UpdateRoleDto): Promise<TRole> {
    const result = await this.db.update("roles", dto, [
      { columnName: "id", value: id },
    ]);
    return result[0];
  }

  async deleteRole(id: number): Promise<void> {
    return this.db.delete("roles", [{ columnName: "id", value: id }]);
  }
}
