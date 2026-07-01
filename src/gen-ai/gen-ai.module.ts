import { Module } from "@nestjs/common";

import { ApiKeyController } from "@/src/gen-ai/api-key/api-key.controller";
import { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import { EncryptionService } from "@/src/gen-ai/api-key/encryption.service";

import { GenAiService } from "./gen-ai.service";

@Module({
  controllers: [ApiKeyController],
  providers: [GenAiService, EncryptionService, ApiKeyService],
  exports: [GenAiService],
})
export class GenAiModule {}
