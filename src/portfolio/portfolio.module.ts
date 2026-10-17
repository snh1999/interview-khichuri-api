import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";
import { ProfileModule } from "@/src/profile/profile.module";

import { PortfolioController } from "./portfolio.controller";
import { PortfolioService } from "./portfolio.service";

@Module({
  imports: [GenAiModule, ProfileModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
