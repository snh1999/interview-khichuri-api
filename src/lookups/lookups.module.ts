import { Module } from "@nestjs/common";

import { LookupsController } from "@/src/lookups/lookups.controller";
import { LookupsService } from "@/src/lookups/lookups.service";

@Module({
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
