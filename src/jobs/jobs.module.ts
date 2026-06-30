import { Module } from "@nestjs/common";

import { LookupsModule } from "@/src/lookups/lookups.module";

import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [LookupsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
