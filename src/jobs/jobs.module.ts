import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";
import { LookupsModule } from "@/src/lookups/lookups.module";

import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [GenAiModule, LookupsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
