import { Body, Controller, Post } from "@nestjs/common";

import { UserId } from "@/src/config/guards/user-id.decorator";
import { SynthesizeSpeechDto } from "@/src/gen-ai/dto/synthesize-speech.dto";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";

@Controller("ai/tts")
export class GenAiController {
  constructor(private readonly genAiService: GenAiService) {}

  @Post()
  synthesize(
    @Body() dto: SynthesizeSpeechDto,
    @UserId() userId?: string,
  ): Promise<{ audio: string; format: string }> {
    return this.genAiService.synthesizeSpeech(dto.text, dto.voice, userId);
  }
}
