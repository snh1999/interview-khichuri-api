import { describe, expect, it } from "vitest";

import { pcm16ToWav } from "./synthesize-speech.dto";

const readTag = (wav: Buffer, offset: number): string =>
  wav.subarray(offset, offset + 4).toString("ascii");

describe("pcm16ToWav", () => {
  it("writes a 44-byte header that describes the PCM payload", () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
    const wav = pcm16ToWav(pcm);

    expect(wav.length).toBe(44 + pcm.length);
    expect(readTag(wav, 0)).toBe("RIFF");
    expect(readTag(wav, 8)).toBe("WAVE");
    expect(readTag(wav, 12)).toBe("fmt ");
    expect(readTag(wav, 36)).toBe("data");
  });

  // The RIFF size and the data size are separate fields; a mismatch makes most
  // players reject or truncate the file, so both are asserted against the payload.
  it("sizes both the RIFF chunk and the data chunk from the payload length", () => {
    const pcm = Buffer.alloc(100, 7);
    const wav = pcm16ToWav(pcm);

    expect(wav.readUInt32LE(4)).toBe(44 + pcm.length - 8);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  it("describes 24kHz mono 16-bit PCM by default", () => {
    const wav = pcm16ToWav(Buffer.alloc(8));

    expect(wav.readUInt32LE(16)).toBe(16); // fmt chunk size
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(48000); // byte rate
    expect(wav.readUInt16LE(32)).toBe(2); // block align
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
  });

  it("derives byte rate and block align from a custom sample rate", () => {
    const wav = pcm16ToWav(Buffer.alloc(8), 16000);

    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt32LE(28)).toBe(32000);
  });

  it("copies the PCM bytes verbatim after the header", () => {
    const pcm = Buffer.from([0xff, 0x00, 0x12, 0x34]);
    const wav = pcm16ToWav(pcm);

    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("produces a header-only buffer for empty audio", () => {
    const wav = pcm16ToWav(Buffer.alloc(0));

    expect(wav.length).toBe(44);
    expect(wav.readUInt32LE(40)).toBe(0);
  });
});
