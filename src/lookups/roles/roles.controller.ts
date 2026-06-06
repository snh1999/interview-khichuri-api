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
  Query,
} from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import { TRole } from "@/src/database/database.types";
import { CreateLookupDto, UpdateLookupDto } from "@/src/lookups/lookups.dto";

import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  createRole(@Body() createRoleDto: CreateLookupDto): Promise<TRole> {
    return this.rolesService.createRole(createRoleDto);
  }

  @Get()
  findAllRoles(@Query("name") name?: string): Promise<TRole[]> {
    return this.rolesService.findAll(name);
  }

  @Patch(":id")
  @Roles(["admin"])
  updateRole(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateLookupDto,
  ): Promise<TRole> {
    return this.rolesService.updateRole(id, updateRoleDto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(["admin"])
  deleteRole(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.rolesService.deleteRole(id);
  }
}
