import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import { Pagination } from "@/src/config/guards/pagination.decorator";
import { UserId } from "@/src/config/guards/user-id.decorator";
import type {
  TPagination,
  TPrompt,
  TUserDefaultWithPrompt,
} from "@/src/database/database.types";

import { ValidatePromptDto } from "./dto/validate-prompt.dto";
import {
  CreatePromptDto,
  FindPromptsQuery,
  SetDefaultPromptDto,
  UpdatePromptDto,
} from "./prompts.dto";
import { PromptsService } from "./prompts.service";
import {
  type IValidationResult,
  PromptValidatorService,
} from "./validators/prompt-validator.service";

@Controller("prompts")
export class PromptsController {
  constructor(
    private readonly promptsService: PromptsService,
    private readonly promptValidator: PromptValidatorService,
  ) {}

  @Post()
  create(
    @Body() dto: CreatePromptDto,
    @UserId() userId?: string,
  ): Promise<TPrompt> {
    return this.promptsService.create(dto, userId);
  }

  @Post("validate")
  async validate(
    @Body() dto: ValidatePromptDto,
    @UserId() userId?: string,
  ): Promise<IValidationResult> {
    return this.promptValidator.validate(
      dto.prompt,
      dto.type,
      dto.provider,
      dto.title,
      userId,
    );
  }

  @Get()
  findAll(
    @Query() query: FindPromptsQuery,
    @Pagination() pagination?: TPagination,
    @UserId() userId?: string,
  ): Promise<TPrompt[]> {
    return this.promptsService.findAll(
      query.scope,
      userId,
      query.type,
      query.search,
      pagination,
    );
  }

  @Get("likes")
  findAllLiked(
    @Query() query: FindPromptsQuery,
    @Pagination() pagination?: TPagination,
    @UserId() userId?: string,
  ): Promise<TPrompt[]> {
    return this.promptsService.findAllLiked(userId, query.type, pagination);
  }

  @Get("defaults")
  getDefaults(@UserId() userId?: string): Promise<TUserDefaultWithPrompt[]> {
    return this.promptsService.getDefaults(userId);
  }

  @Put("defaults")
  setDefault(
    @Body() dto: SetDefaultPromptDto,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.promptsService.setDefault(dto, userId);
  }

  @Get(":id")
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @UserId() userId?: string,
  ): Promise<TPrompt> {
    return this.promptsService.findById(id, userId);
  }

  @Patch(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePromptDto,
    @UserId() userId?: string,
  ): Promise<TPrompt> {
    return this.promptsService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("id", ParseIntPipe) id: number,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.promptsService.delete(id, userId);
  }

  @Delete("admin/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(["admin"])
  adminRemove(
    @Param("id", ParseIntPipe) id: number,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.promptsService.delete(id, userId, true);
  }

  @Post(":id/like")
  toggleLike(
    @Param("id", ParseIntPipe) id: number,
    @UserId() userId?: string,
  ): Promise<{ likeCount: number }> {
    return this.promptsService.toggleLike(id, userId);
  }
}
