import { Module } from "@nestjs/common";

import { ApiKeyService } from "@/src/gen-ai/encryption/api-key.service";
import { EncryptionService } from "@/src/gen-ai/encryption/encryption.service";

import { GenAiController } from "./gen-ai.controller";
import { GenAiService } from "./gen-ai.service";

@Module({
  controllers: [GenAiController],
  providers: [GenAiService, EncryptionService, ApiKeyService],
})
export class GenAiModule {}
