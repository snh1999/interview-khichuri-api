import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";
import { LookupsModule } from "@/src/lookups/lookups.module";
import { ResumeModule } from "@/src/resume/resume.module";

import { InterviewController } from "./interview/interview.controller";
import { InterviewService } from "./interview/interview.service";
import { PrepSessionController } from "./prep-session.controller";
import { PrepSessionService } from "./prep-session.service";

@Module({
  imports: [GenAiModule, LookupsModule, ResumeModule],
  controllers: [PrepSessionController, InterviewController],
  providers: [PrepSessionService, InterviewService],
})
export class PrepSessionModule {}
