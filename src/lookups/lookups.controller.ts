import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import { TRole } from "@/src/database/database.types";
import { CreateRoleDto, UpdateRoleDto } from "@/src/lookups/dto/roles.dto";

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

  @Patch("role/:id")
  @Roles(["admin"])
  updateRole(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<TRole> {
    return this.lookupsService.updateRole(id, updateRoleDto);
  }

  @Delete("role/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(["admin"])
  deleteRole(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.lookupsService.deleteRole(id);
  }
}
