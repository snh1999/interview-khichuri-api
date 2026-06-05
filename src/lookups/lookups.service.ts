import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import { TRole } from "@/src/database/database.types";
import { CreateRoleDto } from "@/src/lookups/dto/roles.dto";

@Injectable()
export class LookupsService {
  public constructor(private readonly db: IDatabaseService) {}

  async createRole(dto: CreateRoleDto): Promise<TRole> {
    return this.db.create("roles", dto);
  }

  async findAll(): Promise<TRole[]> {
    return this.db.findAllByColumn("roles");
  }
}
