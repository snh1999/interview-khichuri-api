import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";

import { PortfolioController } from "./portfolio.controller";
import { PortfolioService } from "./portfolio.service";

@Module({
  imports: [GenAiModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
