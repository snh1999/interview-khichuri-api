import { z } from "zod";

import { createZodDto } from "@/src/config/utils/zod-dto";
import { GOOGLE_TTS_MAX_CHARS } from "@/src/gen-ai/gen-ai.constants";

const synthesizeSpeechSchema = z.object({
  text: z.string().trim().min(1).max(GOOGLE_TTS_MAX_CHARS),
  voice: z.string().trim().max(60).optional(),
});

export class SynthesizeSpeechDto extends createZodDto(synthesizeSpeechSchema) {}
