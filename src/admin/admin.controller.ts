import { Controller, Get, Param } from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import { SortBy } from "@/src/config/guards/sort-by.decorator";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import type { TPagination } from "@/src/database/database.types";

import {
  ADMIN_USER_SORTABLE,
  AdminUsersQuery,
  type TAdminUsersQuery,
} from "./admin.dto";
import { AdminService } from "./admin.service";
import type {
  IAdminStats,
  IAdminUserDetail,
  IAdminUsersResponse,
} from "./admin.types";

@Controller("admin")
export class AdminController {
  public constructor(private readonly adminService: AdminService) {}

  @Get("stats")
  @Roles(["admin"])
  public getStats(): Promise<IAdminStats> {
    return this.adminService.getStats();
  }

  @Get("users")
  @Roles(["admin"])
  public getUsers(
    @AdminUsersQuery() query: TAdminUsersQuery,
    @Pagination() pagination?: TPagination,
    @SortBy(ADMIN_USER_SORTABLE) sort?: TSortEntry[],
  ): Promise<IAdminUsersResponse> {
    return this.adminService.findUsers(query, pagination, sort);
  }

  @Get("users/:id")
  @Roles(["admin"])
  public getUser(@Param("id") id: string): Promise<IAdminUserDetail> {
    return this.adminService.findUser(id);
  }
}
