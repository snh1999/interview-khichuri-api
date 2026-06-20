import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { UserId } from "@/src/config/guards/user-id.decorator";
import type { TApiKey } from "@/src/database/database.types";
import { ApiKeyService } from "@/src/gen-ai/encryption/api-key.service";

import { CreateApiKeyDto, FindApiKeyQuery } from "./dto/gen-ai.dto";

@Controller("ai")
export class GenAiController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post("api-keys")
  async createKey(
    @Body() dto: CreateApiKeyDto,
    @UserId() userId?: string,
  ): Promise<TApiKey> {
    const { key: _, ...data } = await this.apiKeyService.create(dto, userId);
    return data;
  }

  @Get("api-keys")
  async findAllKeys(
    @Query() query: FindApiKeyQuery,
    @UserId() userId?: string,
  ): Promise<TApiKey[]> {
    const { platform, isActive } = query;
    const isActiveBool =
      isActive === "true" ? true : isActive === "false" ? false : undefined;
    const results = await this.apiKeyService.findAll(
      platform,
      isActiveBool,
      userId,
    );
    return results.map(({ key: _, ...rest }) => rest);
  }

  @Delete("api-keys/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteKey(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.apiKeyService.delete(id, userId);
  }

  @Patch("api-keys/:id/activate")
  async activateKey(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.apiKeyService.activateApiKey(id, userId);
  }
}
