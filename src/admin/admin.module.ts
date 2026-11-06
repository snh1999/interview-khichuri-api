import { Module } from "@nestjs/common";

import { CrawlModule } from "@/src/crawl/crawl.module";

import { AdminJobsController } from "./admin-jobs.controller";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [CrawlModule],
  controllers: [AdminController, AdminJobsController],
  providers: [AdminService],
})
export class AdminModule {}
