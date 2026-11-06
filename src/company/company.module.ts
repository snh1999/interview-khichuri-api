import { Module } from "@nestjs/common";

import { CrawlModule } from "@/src/crawl/crawl.module";
import { JobsModule } from "@/src/jobs/jobs.module";

import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";

@Module({
  imports: [CrawlModule, JobsModule],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
