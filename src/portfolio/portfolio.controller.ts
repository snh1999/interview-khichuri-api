import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  type MessageEvent,
  Post,
  Sse,
} from "@nestjs/common";
import { Observable } from "rxjs";

import { createSseStream } from "@/src/common/create-stream";
import { UserId } from "@/src/config/guards/user-id.decorator";
import { SkipEnvelope } from "@/src/config/interceptors/skip-envelope.decorator";

import {
  GenerateBuilderDto,
  GenerateProjectDto,
  GenerateSketchDto,
  type TBuilderResult,
  type TGeneratedDesign,
  type TProjectStreamChunk,
} from "./portfolio.dto";
import { PortfolioService } from "./portfolio.service";

@Controller("portfolio")
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post("sketch")
  @HttpCode(HttpStatus.OK)
  public generateSketch(
    @Body() dto: GenerateSketchDto,
    @UserId() userId?: string,
  ): Promise<TGeneratedDesign> {
    return this.portfolioService.generateSketch(dto, userId ?? "");
  }

  @Post("builder")
  @HttpCode(HttpStatus.OK)
  public generateBuilder(
    @Body() dto: GenerateBuilderDto,
    @UserId() userId?: string,
  ): Promise<TBuilderResult> {
    return this.portfolioService.generateBuilder(dto, userId ?? "");
  }

  @Post("generate")
  @HttpCode(HttpStatus.OK)
  @SkipEnvelope()
  @Sse()
  public generateProject(
    @Body() dto: GenerateProjectDto,
    @UserId() userId?: string,
  ): Observable<MessageEvent> {
    return createSseStream<TProjectStreamChunk>({
      getSource: () =>
        Promise.resolve(
          this.portfolioService.generateProject(dto, userId ?? ""),
        ),
      mapChunk: (chunk) => chunk,
      getErrorMessage: (error) =>
        error instanceof HttpException
          ? error.message
          : "Could not generate the project",
    });
  }
}
