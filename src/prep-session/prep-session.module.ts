import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";
import { LookupsModule } from "@/src/lookups/lookups.module";

import { PrepSessionController } from "./prep-session.controller";
import { PrepSessionService } from "./prep-session.service";

@Module({
  imports: [GenAiModule, LookupsModule],
  controllers: [PrepSessionController],
  providers: [PrepSessionService],
})
export class PrepSessionModule {}
