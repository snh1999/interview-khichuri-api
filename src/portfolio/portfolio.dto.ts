import { z } from "zod";

import {
  DEFAULT_MAX_STRING_LENGTH,
  MID_LENGTH,
  SHORT_LENGTH,
  str,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { aiCommonSchema } from "@/src/gen-ai/gen-ai.constants";

export const themeConfigSchema = z.object({
  id: z.string().max(SHORT_LENGTH),
  name: z.string().max(MID_LENGTH),
  primaryColor: z.string().max(MID_LENGTH),
  secondaryColor: z.string().max(MID_LENGTH),
  accentColor: z.string().max(MID_LENGTH),
  backgroundColor: z.string().max(MID_LENGTH),
  surfaceColor: z.string().max(MID_LENGTH),
  textColor: z.string().max(MID_LENGTH),
  textMutedColor: z.string().max(MID_LENGTH),
  fontHeading: z.string().max(SHORT_LENGTH),
  fontBody: z.string().max(SHORT_LENGTH),
  borderRadius: z.enum(["none", "sm", "md", "lg", "xl", "full"]),
  styleMood: z.enum(["modern", "minimal", "brutalist", "luxury", "playful"]),
});

const wireframeSummarySchema = z.object({
  elementCount: z.number(),
  detectedLayout: z.string(),
  sections: z.array(z.string()),
});

export const generatedDesignSchema = z.object({
  id: z.string(),
  routes: z.array(z.string()),
  createdAt: z.string(),
  prompt: z.string().optional(),
  themeUsed: themeConfigSchema,
  wireframeSummary: wireframeSummarySchema,
  // Path-keyed file map: "/App.js" (router) + one file per route + "/styles.css".
  files: z.record(z.string(), z.string()),
  previewType: z.enum(["interactive", "code", "side-by-side"]),
});

export type TGeneratedDesign = z.infer<typeof generatedDesignSchema>;

// What the model itself produces for a sketch; the service fills in the bookkeeping fields (id, timestamps, theme) from the request.
export const designContentSchema = z.object({
  wireframeSummary: wireframeSummarySchema,
  routes: z.array(z.string()).min(1).max(12),
  files: z
    .record(z.string(), z.string())
    .refine((files) => Object.keys(files).length <= 20, {
      message: "At most 20 files per design",
    }),
});

// What the model produces for a builder turn: a minimal list of file edits instead of whole rewritten files.
// The service applies them to the files the client sent and returns the resulting project.
export const fileOpSchema = z.object({
  op: z.enum(["create", "update", "delete"]),
  path: z.string().min(1).max(200),
  content: z.string().max(100_000).nullish(),
  search: z.string().max(100_000).nullish(),
  replace: z.string().max(100_000).nullish(),
});

export type TFileOp = z.infer<typeof fileOpSchema>;

export const builderOperationsSchema = z.object({
  operations: z.array(fileOpSchema).max(40),
  message: z.string(),
});

export type TBuilderOperations = z.infer<typeof builderOperationsSchema>;

// Compact description of the whole project
// As The client sends full contents of only the files relevant to a turn,
// the manifest lets the model see every path (and lets the server accept deletes of files it did not receive).
export const manifestEntrySchema = z.object({
  path: z.string().min(1).max(200),
  hash: z.string().max(64).optional(),
  size: z.number().int().nonnegative().optional(),
});

export type TManifestEntry = z.infer<typeof manifestEntrySchema>;

// Response shape: the full resulting project files plus a chat summary, and
// the human-readable list of applied edits so the client can show which files changed (and reconcile deletes) without diffing the whole project.
export const builderResultSchema = z.object({
  files: z.record(z.string(), z.string()),
  message: z.string(),
  applied: z.array(z.string()),
});

export type TBuilderResult = z.infer<typeof builderResultSchema>;

// Genesis flow: the model first returns a plan of the files to create
// each file's code is generated one at a time (bounded concurrency), streamed to the client as it completes.
export const filePlanEntrySchema = z.object({
  path: z.string().min(1).max(200),
  description: z.string().max(MID_LENGTH),
  exports: z.array(z.string().max(SHORT_LENGTH)).max(20).optional(),
  imports: z.array(z.string().max(SHORT_LENGTH)).max(20).optional(),
});

export type TFilePlanEntry = z.infer<typeof filePlanEntrySchema>;

export const filePlanSchema = z.object({
  files: z.array(filePlanEntrySchema).min(1).max(30),
  projectName: z.string().max(MID_LENGTH),
  projectDescription: z.string().max(DEFAULT_MAX_STRING_LENGTH),
});

export type TFilePlan = z.infer<typeof filePlanSchema>;

export const fileCodeSchema = z.object({
  code: z.string().max(100_000),
});

export const generateProjectSchema = aiCommonSchema.extend({
  prompt: str(DEFAULT_MAX_STRING_LENGTH),
});

export class GenerateProjectDto extends createZodDto(generateProjectSchema) {}

// Chunks streamed from POST /portfolio/generate for the genesis flow.
// `error` is emitted by the SSE wrapper itself when generation throws mid-stream.
export type TProjectStreamChunk =
  | { type: "plan"; files: { path: string; description: string }[] }
  | { type: "file-start"; path: string }
  | { type: "file-complete"; path: string; content: string }
  | {
      type: "finish";
      files: Record<string, string>;
      message: string;
      failed: string[];
    }
  | { type: "error"; message: string };

export const sketchSchema = aiCommonSchema.extend({
  prompt: str(DEFAULT_MAX_STRING_LENGTH),
  // Frames are only serialized into the AI prompt (grouped by route into pages),
  // so loose objects keep whatever the frontend sends without re-declaring the whole canvas element union here.
  frames: z
    .array(
      z.looseObject({
        id: z.string().min(1).max(MID_LENGTH),
        title: z.string().max(MID_LENGTH).optional(),
        route: z.string().max(MID_LENGTH).optional(),
      }),
    )
    .min(1)
    .max(12),
  elements: z.array(z.looseObject({})).max(500),
  theme: themeConfigSchema,
});

export class GenerateSketchDto extends createZodDto(sketchSchema) {}

export const builderSchema = aiCommonSchema.extend({
  prompt: str(DEFAULT_MAX_STRING_LENGTH),
  // Compact list of every file in the project, so the model can reason about files whose contents the client did not send .
  manifest: z.array(manifestEntrySchema).max(200).optional(),
  files: z
    .record(z.string().min(1).max(200), z.string().max(100_000))
    .refine((files) => Object.keys(files).length <= 40, {
      message: "At most 40 files per request",
    }),
});

export class GenerateBuilderDto extends createZodDto(builderSchema) {}
