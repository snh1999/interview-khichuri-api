import { Module } from "@nestjs/common";

import { PrepSessionController } from "./prep-session.controller";
import { PrepSessionService } from "./prep-session.service";

@Module({
  controllers: [PrepSessionController],
  providers: [PrepSessionService],
})
export class PrepSessionModule {}
