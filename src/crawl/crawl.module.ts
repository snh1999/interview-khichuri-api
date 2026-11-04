import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";

import { CrawlAiService } from "./crawl.ai";
import { CrawlAiOwnerService } from "./crawl.ai-owner";
import { CrawlDrainService } from "./crawl.drain.service";
import { CrawlService } from "./crawl.service";

// Timers would fire mid-test, and app mode has no crawler. `.env.test.web` does
// not set NODE_ENV, so vitest's own flag is the reliable test signal.
const schedulingDisabled =
  Boolean(process.env.IS_APP_MODE) ||
  process.env.NODE_ENV === "test" ||
  Boolean(process.env.VITEST);

@Module({
  imports: [
    GenAiModule,
    ...(schedulingDisabled ? [] : [ScheduleModule.forRoot()]),
  ],
  providers: [
    CrawlAiOwnerService,
    CrawlAiService,
    CrawlDrainService,
    CrawlService,
  ],
  exports: [CrawlAiService, CrawlService],
})
export class CrawlModule {}
