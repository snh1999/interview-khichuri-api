import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";
import { LookupsModule } from "@/src/lookups/lookups.module";
import { UtilitiesModule } from "@/src/utilities/utilities.module";

import { ResumeController } from "./resume.controller";
import { ResumeService } from "./resume.service";

@Module({
  controllers: [ResumeController],
  providers: [ResumeService],
  imports: [UtilitiesModule, GenAiModule, LookupsModule],
})
export class ResumeModule {}
