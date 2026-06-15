import { Injectable, NotFoundException } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import {
  TApiKeyInsecure,
  TApiKeyPlatform,
  TDatabase,
} from "@/src/database/database.types";
import { CreateApiKeyDto } from "@/src/gen-ai/dto/gen-ai.dto";

import { EncryptionService } from "./encryption.service";

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly db: IDatabaseService,
  ) {}

  async create(
    dto: CreateApiKeyDto,
    userId?: string,
  ): Promise<TApiKeyInsecure> {
    const { key, isActive, platform, name } = dto;
    const encrypted = this.encryptionService.encrypt(key);
    return this.db.withTransaction(async (transaction) => {
      if (isActive) {
        await this._disableActiveKeys(platform, userId, transaction);
      }
      return this.db.create(
        "api_key",
        { platform, name, userId, isActive, key: encrypted },
        transaction,
      );
    });
  }

  async findAll(
    platform?: TApiKeyPlatform,
    isActive?: boolean,
    userId?: string,
  ): Promise<TApiKeyInsecure[]> {
    return this.db.findAllByColumn("api_key", [
      ...(isActive !== undefined
        ? [{ columnName: "isActive" as const, value: isActive }]
        : []),
      ...(platform
        ? [{ columnName: "platform" as const, value: platform }]
        : []),
      ...(userId ? [{ columnName: "userId" as const, value: userId }] : []),
    ]);
  }

  async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("api_key", [
      { columnName: "id", value: id },
      ...(userId ? [{ columnName: "userId" as const, value: userId }] : []),
    ]);
  }

  async activateApiKey(id: string, userId?: string): Promise<void> {
    const apiKey = await this.db.findById("api_key", id);
    await this.db.withTransaction(async (transaction) => {
      await this._disableActiveKeys(apiKey.platform, userId, transaction);
      await this.db.update(
        "api_key",
        { isActive: true },
        [
          { columnName: "id", value: id },
          ...(userId ? [{ columnName: "userId" as const, value: userId }] : []),
        ],
        transaction,
      );
    });
  }

  private async _disableActiveKeys(
    platform: TApiKeyPlatform,
    userId?: string,
    db?: TDatabase,
  ) {
    try {
      await this.db.update(
        "api_key",
        { isActive: false },
        [
          { columnName: "platform", value: platform },
          { columnName: "isActive", value: true },
          ...(userId ? [{ columnName: "userId" as const, value: userId }] : []),
        ],
        db,
      );
    } catch (err) {
      if (!(err instanceof NotFoundException)) {
        throw err;
      }
    }
  }

  async useApiKey<T>(
    platform: TApiKeyPlatform,
    operation: (key: string) => Promise<T>,
    userId?: string,
  ): Promise<T> {
    const decryptedKey = await this._findApiKey(platform, userId);
    return operation(decryptedKey);
  }

  private async _findActive(
    platform: TApiKeyPlatform,
    userId?: string,
    silent?: boolean,
  ): Promise<TApiKeyInsecure> {
    const result = await this.findAll(platform, true, userId);
    if (result.length === 0 && !silent) {
      throw new NotFoundException(`No API key found for: ${platform}`);
    }
    return result[0];
  }

  private async _findApiKey(
    platform: TApiKeyPlatform,
    userId?: string,
  ): Promise<string> {
    const apiKey = await this._findActive(platform, userId);
    return this.encryptionService.decrypt(apiKey.key);
  }
}
