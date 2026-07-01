import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";

import { PrepSessionController } from "./prep-session.controller";
import { PrepSessionService } from "./prep-session.service";

@Module({
  imports: [GenAiModule],
  controllers: [PrepSessionController],
  providers: [PrepSessionService],
})
export class PrepSessionModule {}
