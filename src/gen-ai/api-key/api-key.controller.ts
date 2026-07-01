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
import {
  CreateApiKeyDto,
  FindApiKeyQuery,
  UpdateApiKeyDto,
} from "@/src/gen-ai/api-key/api-key.dto";

import { ApiKeyService } from "./api-key.service";

@Controller("ai/api-keys")
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  async createKey(
    @Body() dto: CreateApiKeyDto,
    @UserId() userId?: string,
  ): Promise<TApiKey> {
    const { key: _, ...data } = await this.apiKeyService.create(dto, userId);
    return data;
  }

  @Get()
  async findAllKeys(
    @Query() query: FindApiKeyQuery,
    @UserId() userId?: string,
  ): Promise<TApiKey[]> {
    const { provider, isActive } = query;
    const isActiveBool =
      isActive === "true" ? true : isActive === "false" ? false : undefined;
    const results = await this.apiKeyService.findAll(
      provider,
      isActiveBool,
      userId,
    );
    return results.map(({ key: _, ...rest }) => rest);
  }

  @Patch(":id")
  async updateKey(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateApiKeyDto,
    @UserId() userId?: string,
  ): Promise<TApiKey> {
    const { key: _, ...data } = await this.apiKeyService.update(
      id,
      dto,
      userId,
    );
    return data;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteKey(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.apiKeyService.delete(id, userId);
  }

  @Patch(":id/activate")
  async activateKey(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.apiKeyService.activateApiKey(id, userId);
  }
}
