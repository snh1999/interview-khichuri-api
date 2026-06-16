import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import type { TCompany } from "@/src/database/database.types";

import { CompanyService } from "./company.service";
import { CreateCompanyDto, UpdateCompanyDto } from "./dto/company.dto";

@Controller("company")
export class CompanyController {
  public constructor(private readonly companyService: CompanyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public create(@Body() dto: CreateCompanyDto): Promise<TCompany> {
    return this.companyService.create(dto);
  }

  @Get()
  public findAll(@Query("name") name?: string): Promise<TCompany[]> {
    return this.companyService.findAll(name);
  }

  @Patch(":id")
  @Roles(["admin"])
  public update(
    @Param("id") id: number,
    @Body() dto: UpdateCompanyDto,
  ): Promise<TCompany> {
    return this.companyService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(["admin"])
  public delete(@Param("id") id: number): Promise<void> {
    return this.companyService.delete(id);
  }
}
