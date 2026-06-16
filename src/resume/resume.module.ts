import { Module } from "@nestjs/common";

import { UtilitiesModule } from "@/src/utilities/utilities.module";

import { ResumeController } from "./resume.controller";
import { ResumeService } from "./resume.service";

@Module({
  controllers: [ResumeController],
  providers: [ResumeService],
  imports: [UtilitiesModule],
})
export class ResumeModule {}
