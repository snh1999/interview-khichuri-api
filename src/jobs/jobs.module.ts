import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";
import { LookupsModule } from "@/src/lookups/lookups.module";
import { ResumeModule } from "@/src/resume/resume.module";

import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [GenAiModule, LookupsModule, ResumeModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
