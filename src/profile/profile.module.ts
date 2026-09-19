import { Module } from "@nestjs/common";

import { LookupsModule } from "@/src/lookups/lookups.module";

import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [LookupsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
