import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APICallError, generateText } from "ai";

import { IDatabaseService } from "@/src/database/database.service";
import {
  TApiKeyInsecure,
  TApiKeyProvider,
  TDatabase,
} from "@/src/database/database.types";
import {
  CreateApiKeyDto,
  UpdateApiKeyDto,
} from "@/src/gen-ai/api-key/api-key.dto";
import { PROVIDER_CONFIG } from "@/src/gen-ai/gen-ai.constants";

import { EncryptionService } from "./encryption.service";

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly db: IDatabaseService,
    private readonly config: ConfigService,
  ) {}

  async create(
    dto: CreateApiKeyDto,
    userId?: string,
  ): Promise<TApiKeyInsecure> {
    const { key, isActive, provider, name, model } = dto;

    await this._verifyKey(provider, key);

    const encrypted = this.encryptionService.encrypt(key);
    return this.db.withTransaction(async (transaction) => {
      if (isActive) {
        await this._disableActiveKeys(provider, userId, transaction);
      }
      return this.db.create(
        "api_key",
        { provider, name, userId, isActive, key: encrypted, model },
        transaction,
      );
    });
  }

  async update(
    id: string,
    dto: UpdateApiKeyDto,
    userId?: string,
  ): Promise<TApiKeyInsecure> {
    const existing = await this.db.findById("api_key", id, {
      filter: { ...(userId ? { userId } : {}) },
    });

    if (dto.model) {
      const decryptedKey = this.encryptionService.decrypt(existing.key);
      await this._verifyKey(existing.provider, decryptedKey, dto.model);
    }

    const [updated] = await this.db.update("api_key", dto, { id });
    return updated;
  }

  async findAll(
    provider?: TApiKeyProvider,
    isActive?: boolean,
    userId?: string,
  ): Promise<TApiKeyInsecure[]> {
    return this.db.findAllByColumn("api_key", {
      filter: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(provider ? { provider } : {}),
        ...(userId ? { userId } : {}),
      },
      sortBy: [{ column: "provider" }, { column: "createdAt", order: "desc" }],
    });
  }

  async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("api_key", {
      id,
      ...(userId ? { userId } : {}),
    });
  }

  async activateApiKey(id: string, userId?: string): Promise<void> {
    const apiKey = await this.db.findById("api_key", id, {
      filter: { ...(userId ? { userId } : {}) },
    });
    await this.db.withTransaction(async (transaction) => {
      await this._disableActiveKeys(apiKey.provider, userId, transaction);
      await this.db.update(
        "api_key",
        { isActive: true },
        { id, ...(userId ? { userId } : {}) },
        transaction,
      );
    });
  }

  private async _disableActiveKeys(
    provider: TApiKeyProvider,
    userId?: string,
    db?: TDatabase,
  ) {
    try {
      await this.db.update(
        "api_key",
        { isActive: false },
        {
          provider,
          isActive: true,
          ...(userId ? { userId } : {}),
        },
        db,
      );
    } catch (err) {
      if (!(err instanceof NotFoundException)) {
        throw err;
      }
    }
  }

  async useApiKey<T>(
    provider: TApiKeyProvider,
    operation: (keyInfo: { key: string; model: string | null }) => Promise<T>,
    userId?: string,
  ): Promise<T> {
    const apiKey = await this._findActiveKey(provider, userId);
    const decryptedKey = this.encryptionService.decrypt(apiKey.key);
    return operation({ key: decryptedKey, model: apiKey.model ?? null });
  }

  private async _findActiveKey(
    provider: TApiKeyProvider,
    userId?: string,
  ): Promise<TApiKeyInsecure> {
    const result = await this.findAll(provider, true, userId);
    if (result.length === 0) {
      throw new NotFoundException(`No API key found for: ${provider}`);
    }
    return result[0];
  }

  // GenAiService uses ApiKeyService internally, can not place it there
  private async _verifyKey(
    provider: TApiKeyProvider,
    key: string,
    model?: string | null,
  ): Promise<void> {
    if (this.config.get("NODE_ENV") === "test") {
      return;
    }

    const config = PROVIDER_CONFIG[provider];
    const providerInstance =
      config.sdk === "google"
        ? createGoogleGenerativeAI({ apiKey: key })
        : createOpenAI({ apiKey: key, baseURL: config.baseURL });

    try {
      await generateText({
        model: providerInstance(model ?? config.defaultModel),
        prompt: "Reply with just the word: ok",
      });
    } catch (error) {
      // wraps the 403: to preserve project api conventions
      if (error instanceof APICallError) {
        throw new BadRequestException(error.message);
      }

      const errorMessage =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: { error?: string } }).data?.error
          : "";

      throw new BadRequestException(
        `Invalid API key ${model ? "or model" : ""} for ${provider}. Check the ${model ? "name of model or" : ""} key and try again. ${errorMessage ?? ""}`,
      );
    }
  }
}
