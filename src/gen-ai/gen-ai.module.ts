import { Module } from "@nestjs/common";

import { ApiKeyController } from "@/src/gen-ai/api-key/api-key.controller";
import { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import { EncryptionService } from "@/src/gen-ai/api-key/encryption.service";

import { GenAiController } from "./gen-ai.controller";
import { GenAiService } from "./gen-ai.service";

@Module({
  controllers: [ApiKeyController, GenAiController],
  providers: [GenAiService, EncryptionService, ApiKeyService],
  exports: [GenAiService],
})
export class GenAiModule {}
