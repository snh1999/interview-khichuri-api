import { Controller, Get, Post, Body } from "@nestjs/common";

import { TRole } from "@/src/database/database.types";
import { CreateRoleDto } from "@/src/lookups/dto/roles.dto";

import { LookupsService } from "./lookups.service";

@Controller("lookups")
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Post("role")
  createRole(@Body() createRoleDto: CreateRoleDto): Promise<TRole> {
    return this.lookupsService.createRole(createRoleDto);
  }

  @Get("role")
  findAllRoles(): Promise<TRole[]> {
    return this.lookupsService.findAll();
  }
}
