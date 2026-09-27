import { z } from "zod";

import { createZodDto } from "@/src/config/utils/zod-dto";
import { GOOGLE_TTS_MAX_CHARS } from "@/src/gen-ai/gen-ai.constants";

const TTS_SAMPLE_RATE = 24000;
const WAV_HEADER_BYTES = 44;
const WAV_DATA_TAG_OFFSET = 36;
const WAV_FMT_CHUNK_BYTES = 16;
const WAV_PCM_AUDIO_FORMAT = 1;
const WAV_CHANNELS = 1;
const WAV_BYTES_PER_SAMPLE = 2;
const WAV_BITS_PER_SAMPLE = 16;

export const pcm16ToWav = (
  pcm: Buffer,
  sampleRate = TTS_SAMPLE_RATE,
): Buffer => {
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(WAV_HEADER_BYTES + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(WAV_HEADER_BYTES + dataSize - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(WAV_FMT_CHUNK_BYTES, 16);
  buffer.writeUInt16LE(WAV_PCM_AUDIO_FORMAT, 20);
  buffer.writeUInt16LE(WAV_CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * WAV_BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(WAV_CHANNELS * WAV_BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34);
  buffer.write("data", WAV_DATA_TAG_OFFSET);
  buffer.writeUInt32LE(dataSize, WAV_DATA_TAG_OFFSET + 4);
  pcm.copy(buffer, WAV_HEADER_BYTES);
  return buffer;
};

const synthesizeSpeechSchema = z.object({
  text: z.string().trim().min(1).max(GOOGLE_TTS_MAX_CHARS),
  voice: z.string().trim().min(1).max(60).optional(),
});

export class SynthesizeSpeechDto extends createZodDto(synthesizeSpeechSchema) {}
