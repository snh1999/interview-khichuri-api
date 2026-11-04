import { Module } from "@nestjs/common";

import { JobsModule } from "@/src/jobs/jobs.module";

import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";

@Module({
  imports: [JobsModule],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
