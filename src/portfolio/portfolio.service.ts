import { randomUUID } from "node:crypto";

import { BadRequestException, HttpException, Injectable } from "@nestjs/common";

import {
  PORTFOLIO_BUILDER_PROMPT,
  PORTFOLIO_FILE_CODE_PROMPT,
  PORTFOLIO_FILE_PLAN_PROMPT,
  PORTFOLIO_SKETCH_PROMPT,
} from "@/src/gen-ai/gen-ai.constants";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";

import { validateAndFixCode } from "./portfolio.code-validator";
import {
  builderOperationsSchema,
  designContentSchema,
  fileCodeSchema,
  filePlanSchema,
  type GenerateBuilderDto,
  type GenerateProjectDto,
  type GenerateSketchDto,
  type TBuilderResult,
  type TFilePlanEntry,
  type TGeneratedDesign,
  type TProjectStreamChunk,
} from "./portfolio.dto";
import { applyFileOperations, normalizePath } from "./portfolio.operations";

const DEFAULT_SKETCH_PROMPT =
  "Generate clean high-impact portfolio from wireframe sketch";

const ENTRY_FILE = "/App.js";
const STYLES_FILE = "/styles.css";
const FILE_CONCURRENCY = 5;
const MAX_FILE_ATTEMPTS = 2;

// Bounded-concurrency map that reports each item as it starts and finishes, so the genesis stream can show live per-file progress.
type TConcurrentEvent<T, R> =
  { type: "start"; item: T } | { type: "done"; item: T; value: R };

async function* mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): AsyncGenerator<TConcurrentEvent<T, R>> {
  const pending = new Map<
    number,
    Promise<{ index: number; item: T; value: R }>
  >();
  let next = 0;

  const launch = (): TConcurrentEvent<T, R> | null => {
    if (next >= items.length) {
      return null;
    }
    const index = next;
    const item = items[index];
    next += 1;
    pending.set(
      index,
      task(item).then((value) => ({ index, item, value })),
    );
    return { type: "start", item };
  };

  for (let i = 0; i < limit; i += 1) {
    const event = launch();
    if (!event) {
      break;
    }
    yield event;
  }

  while (pending.size > 0) {
    const settled = await Promise.race(pending.values());
    pending.delete(settled.index);
    yield { type: "done", item: settled.item, value: settled.value };
    const event = launch();
    if (event) {
      yield event;
    }
  }
}

// Keep /App.js first and guarantee /styles.css exists before generating,
// so the plan can't produce a project the sandbox cannot run.
const normalizePlan = (entries: TFilePlanEntry[]): TFilePlanEntry[] => {
  const normalized = entries.map((entry) => ({
    ...entry,
    path: normalizePath(entry.path),
  }));
  const ordered = [
    ...normalized.filter((entry) => entry.path === ENTRY_FILE),
    ...normalized.filter((entry) => entry.path !== ENTRY_FILE),
  ];
  if (!ordered.some((entry) => entry.path === ENTRY_FILE)) {
    ordered.unshift({
      path: ENTRY_FILE,
      description: "Root React component that composes the page sections",
    });
  }
  if (!ordered.some((entry) => entry.path === STYLES_FILE)) {
    ordered.push({
      path: STYLES_FILE,
      description: "Global styles (Tailwind entry point)",
    });
  }
  return ordered;
};

// A file generation either produced code or failed (with an optional reason,
// e.g. a quota/config HttpException worth surfacing to the user).
interface IFileGeneration {
  code: string | null;
  error?: string;
}

@Injectable()
export class PortfolioService {
  constructor(private readonly genAiService: GenAiService) {}

  public async generateSketch(
    dto: GenerateSketchDto,
    userId: string,
  ): Promise<TGeneratedDesign> {
    const { frame, elements, theme, provider, model, instruction } = dto;
    const promptText =
      dto.prompt.length > 0 ? dto.prompt : DEFAULT_SKETCH_PROMPT;

    const content = await this.genAiService.generateStructured({
      prompt: `${PORTFOLIO_SKETCH_PROMPT}
        <user_prompt>${promptText}</user_prompt>
        <frame>${JSON.stringify(frame)}</frame>
        <elements>${JSON.stringify(elements)}</elements>
        <theme>${JSON.stringify(theme)}</theme>`,
      schema: designContentSchema,
      provider,
      model,
      instruction,
      userId,
    });

    return {
      id: `design-${Date.now()}-${randomUUID().slice(0, 8)}`,
      frameId: frame.id,
      frameTitle: frame.title?.length ? frame.title : "Portfolio Page",
      createdAt: new Date().toISOString(),
      prompt: promptText,
      themeUsed: theme,
      previewType: "interactive",
      ...content,
      reactCode: validateAndFixCode({ [ENTRY_FILE]: content.reactCode })[
        ENTRY_FILE
      ],
    };
  }

  public async generateBuilder(
    dto: GenerateBuilderDto,
    userId: string,
  ): Promise<TBuilderResult> {
    const { prompt, files, manifest = [], provider, model, instruction } = dto;

    const manifestText = manifest
      .map((entry) =>
        entry.hash
          ? `${entry.path} (${entry.hash}, ${entry.size ?? 0}B)`
          : entry.path,
      )
      .join("\n");

    const result = await this.genAiService.generateStructured({
      prompt: `${PORTFOLIO_BUILDER_PROMPT}
        <user_prompt>${prompt}</user_prompt>
        <manifest>${manifestText}</manifest>
        <files>${JSON.stringify(files)}</files>`,
      schema: builderOperationsSchema,
      provider,
      model,
      instruction,
      userId,
    });

    const {
      files: updatedFiles,
      applied,
      errors,
    } = applyFileOperations(
      files,
      result.operations,
      manifest.map((entry) => entry.path),
    );

    // Only auto-fix the files this turn actually changed;
    // running the fixer over the untouched files the client sent would rewrite code the model was not asked to touch.
    const changed = Object.fromEntries(
      Object.entries(updatedFiles).filter(
        ([path, code]) => code !== files[path],
      ),
    );

    return {
      files: { ...updatedFiles, ...validateAndFixCode(changed) },
      message:
        errors.length > 0
          ? `${result.message}\n\nSome edits could not be applied: ${errors.join("; ")}`
          : result.message,
      applied,
    };
  }

  // Genesis: plan the project, then write each file (bounded concurrency, one retry per file),
  // streaming progress as it goes. The client seeds its project from the file-complete chunks and the final finish chunk.
  public async *generateProject(
    dto: GenerateProjectDto,
    userId: string,
  ): AsyncGenerator<TProjectStreamChunk> {
    const { prompt, provider, model, instruction } = dto;

    const plan = await this.genAiService.generateStructured({
      prompt: `${PORTFOLIO_FILE_PLAN_PROMPT}\n<user_prompt>\n${prompt}\n</user_prompt>`,
      schema: filePlanSchema,
      provider,
      model,
      instruction,
      userId,
    });

    const entries = normalizePlan(plan.files);
    const planText = entries
      .map((entry) => {
        const exports = entry.exports?.length
          ? ` | exports: ${entry.exports.join(", ")}`
          : "";
        const imports = entry.imports?.length
          ? ` | imports: ${entry.imports.join(", ")}`
          : "";
        return `${entry.path}: ${entry.description}${exports}${imports}`;
      })
      .join("\n");

    yield {
      type: "plan",
      files: entries.map(({ path, description }) => ({ path, description })),
    };

    const generated: Record<string, string> = {};
    const failed: string[] = [];
    let entryError: string | undefined;
    for await (const event of mapConcurrent(
      entries,
      FILE_CONCURRENCY,
      (entry) => this._generateFile(entry, planText, generated, dto, userId),
    )) {
      if (event.type === "start") {
        yield { type: "file-start", path: event.item.path };
        continue;
      }
      if (event.value.code !== null) {
        generated[event.item.path] = event.value.code;
        yield {
          type: "file-complete",
          path: event.item.path,
          content: event.value.code,
        };
      } else {
        failed.push(event.item.path);
        if (event.item.path === ENTRY_FILE) {
          entryError = event.value.error;
        }
      }
    }

    if (!(ENTRY_FILE in generated)) {
      throw new BadRequestException(
        entryError
          ? `Could not generate the project entry file: ${entryError}`
          : "Could not generate the project entry file. Please try again.",
      );
    }

    const failedNote =
      failed.length > 0 ? ` Could not generate: ${failed.join(", ")}.` : "";
    yield {
      type: "finish",
      files: generated,
      message: `Generated ${Object.keys(generated).length} files (${plan.projectName}).${failedNote}`,
    };
  }

  private async _generateFile(
    entry: TFilePlanEntry,
    planText: string,
    generated: Record<string, string>,
    dto: GenerateProjectDto,
    userId: string,
  ): Promise<IFileGeneration> {
    const generatedText = Object.entries(generated)
      .map(([path, content]) => `<file path="${path}">\n${content}\n</file>`)
      .join("\n");
    const prompt = `${PORTFOLIO_FILE_CODE_PROMPT}
      <project_plan>${planText}</project_plan>
      <page_goal>${dto.prompt}</page_goal>
      <current_file path="${entry.path}">${entry.description}</current_file>
      <generated_files>${generatedText}</generated_files>`;

    for (let attempt = 0; attempt < MAX_FILE_ATTEMPTS; attempt += 1) {
      try {
        const { code } = await this.genAiService.generateStructured({
          prompt,
          schema: fileCodeSchema,
          provider: dto.provider,
          model: dto.model,
          instruction: dto.instruction,
          userId,
        });
        return { code: validateAndFixCode({ [entry.path]: code })[entry.path] };
      } catch (err) {
        // Config/quota errors won't fix themselves, and the last attempt is the
        // last: give up on this file and let the rest of the project continue.
        if (attempt === MAX_FILE_ATTEMPTS - 1 || err instanceof HttpException) {
          return {
            code: null,
            error: err instanceof HttpException ? err.message : undefined,
          };
        }
      }
    }

    return { code: null };
  }
}
