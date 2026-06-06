import { Module } from "@nestjs/common";

import { RolesController } from "./roles/roles.controller";
import { RolesService } from "./roles/roles.service";
import { TopicsController } from "./topics/topics.controller";
import { TopicsService } from "./topics/topics.service";

@Module({
  controllers: [RolesController, TopicsController],
  providers: [RolesService, TopicsService],
})
export class LookupsModule {}
