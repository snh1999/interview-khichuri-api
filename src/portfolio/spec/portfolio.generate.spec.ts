import { BadRequestException, HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenAiService } from "@/src/gen-ai/gen-ai.service";
import type { ProfileService } from "@/src/profile/profile.service";

import {
  fileCodeSchema,
  filePlanSchema,
  type TProjectStreamChunk,
} from "../portfolio.dto";
import { PortfolioService } from "../portfolio.service";

interface IStructuredCall {
  prompt: string;
  schema: unknown;
}

const collect = async (
  chunks: AsyncGenerator<TProjectStreamChunk>,
): Promise<TProjectStreamChunk[]> => {
  const results: TProjectStreamChunk[] = [];
  for await (const chunk of chunks) {
    results.push(chunk);
  }
  return results;
};

const plan = (files: { path: string; description: string }[]) => ({
  files,
  projectName: "Studio",
  projectDescription: "A studio portfolio",
});

describe("PortfolioService.generateProject", () => {
  let generateStructured: ReturnType<typeof vi.fn>;
  let service: PortfolioService;

  beforeEach(() => {
    generateStructured = vi.fn();
    service = new PortfolioService(
      { generateStructured } as unknown as GenAiService,
      {
        getPortfolioProfile: vi.fn().mockResolvedValue(null),
      } as unknown as ProfileService,
    );
  });

  const dto = { prompt: "studio portfolio", provider: "google" as const };

  it("forces /App.js first, adds /styles.css, and streams plan then files", async () => {
    generateStructured.mockImplementation(({ schema }: IStructuredCall) =>
      schema === filePlanSchema
        ? plan([{ path: "Hero.jsx", description: "hero section" }])
        : {
            code: 'export default function X() { return <div class="a" />; }',
          },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));

    const planned = chunks.find((c) => c.type === "plan");
    expect(planned).toEqual({
      type: "plan",
      files: [
        { path: "/App.js", description: expect.any(String) },
        { path: "/Hero.jsx", description: "hero section" },
        { path: "/styles.css", description: expect.any(String) },
      ],
    });

    const completed = chunks.filter((c) => c.type === "file-complete");
    expect(completed.map((c) => c.path).sort()).toEqual([
      "/App.js",
      "/Hero.jsx",
      "/styles.css",
    ]);
    // validateAndFixCode runs on each file.
    expect(completed.find((c) => c.path === "/App.js")).toMatchObject({
      content: expect.stringContaining('className="a"'),
    });

    const finish = chunks.at(-1);
    expect(finish).toMatchObject({
      type: "finish",
      message: expect.any(String),
      failed: [],
    });
    if (finish?.type === "finish") {
      expect(Object.keys(finish.files).sort()).toEqual([
        "/App.js",
        "/Hero.jsx",
        "/styles.css",
      ]);
    }
  });

  it("does not duplicate entry files already planned", async () => {
    generateStructured.mockImplementation(({ schema }: IStructuredCall) =>
      schema === filePlanSchema
        ? plan([
            { path: "/Hero.jsx", description: "hero" },
            { path: "/App.js", description: "root" },
            { path: "/styles.css", description: "styles" },
          ])
        : { code: "export default function X() { return null; }" },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));
    const planned = chunks.find((c) => c.type === "plan");
    if (planned?.type !== "plan") {
      throw new Error("expected a plan chunk");
    }

    expect(planned.files.map((f) => f.path)).toEqual([
      "/App.js",
      "/Hero.jsx",
      "/styles.css",
    ]);
  });

  it("retries a failed file once before giving up", async () => {
    let heroAttempts = 0;
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/Hero.jsx"')) {
          heroAttempts += 1;
          if (heroAttempts === 1) {
            throw new Error("transient");
          }
          return { code: "export default function Hero() { return null; }" };
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));

    expect(heroAttempts).toBe(2);
    expect(
      chunks.some((c) => c.type === "file-complete" && c.path === "/Hero.jsx"),
    ).toBe(true);
  });

  it("skips a non-entry file that keeps failing but still finishes", async () => {
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/Hero.jsx"')) {
          throw new Error("permanent");
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));

    expect(
      chunks.some((c) => c.type === "file-complete" && c.path === "/Hero.jsx"),
    ).toBe(false);
    expect(chunks.at(-1)?.type).toBe("finish");
  });

  it("does not retry a provider/quota HttpException (429)", async () => {
    let heroAttempts = 0;
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/Hero.jsx"')) {
          heroAttempts += 1;
          throw new HttpException("quota", 429);
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    await collect(service.generateProject(dto, "u1"));

    expect(heroAttempts).toBe(1);
  });

  it("does not retry a permanent provider error (401)", async () => {
    let heroAttempts = 0;
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/Hero.jsx"')) {
          heroAttempts += 1;
          throw new HttpException("unauthorized", 401);
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    await collect(service.generateProject(dto, "u1"));

    expect(heroAttempts).toBe(1);
  });

  it("retries a transient provider error (502) before giving up", async () => {
    let heroAttempts = 0;
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/Hero.jsx"')) {
          heroAttempts += 1;
          if (heroAttempts === 1) {
            throw new HttpException("bad gateway", 502);
          }
          return { code: "export default function Hero() { return null; }" };
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));

    expect(heroAttempts).toBe(2);
    expect(
      chunks.some((c) => c.type === "file-complete" && c.path === "/Hero.jsx"),
    ).toBe(true);
  });

  it("retries a malformed-response error (non-quota HttpException)", async () => {
    let heroAttempts = 0;
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/Hero.jsx"')) {
          heroAttempts += 1;
          if (heroAttempts === 1) {
            throw new BadRequestException(
              "The AI returned a response that could not be parsed.",
            );
          }
          return { code: "export default function Hero() { return null; }" };
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));

    expect(heroAttempts).toBe(2);
    expect(
      chunks.some((c) => c.type === "file-complete" && c.path === "/Hero.jsx"),
    ).toBe(true);
  });

  it("includes the failure reason of a failed file in the finish message", async () => {
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/Hero.jsx"')) {
          throw new HttpException("quota exceeded", 429);
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));
    const finish = chunks.at(-1);

    expect(finish?.type).toBe("finish");
    if (finish?.type === "finish") {
      expect(finish.message).toContain("/Hero.jsx (quota exceeded)");
      expect(finish.failed).toEqual(["/Hero.jsx"]);
    }
  });

  it("generates /App.js first so later files receive its code in their prompt", async () => {
    const prompts: string[] = [];
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        prompts.push(prompt);
        if (schema === filePlanSchema) {
          return plan([{ path: "/Hero.jsx", description: "hero" }]);
        }
        if (prompt.includes('path="/App.js"')) {
          return {
            code: "export default function App() { /* ROOT_MARKER */ return null; }",
          };
        }
        return { code: "export default function Hero() { return null; }" };
      },
    );

    await collect(service.generateProject(dto, "u1"));

    const heroPrompt = prompts.find((p) => p.includes('path="/Hero.jsx"'));
    expect(heroPrompt).toContain("ROOT_MARKER");
  });

  it("generates a duplicated plan path only once", async () => {
    generateStructured.mockImplementation(({ schema }: IStructuredCall) =>
      schema === filePlanSchema
        ? plan([
            { path: "/Hero.jsx", description: "hero" },
            { path: "Hero.jsx", description: "hero (duplicate)" },
          ])
        : { code: "export default function Hero() { return null; }" },
    );

    const chunks = await collect(service.generateProject(dto, "u1"));
    const planned = chunks.find((c) => c.type === "plan");
    if (planned?.type !== "plan") {
      throw new Error("expected a plan chunk");
    }

    expect(planned.files.filter((f) => f.path === "/Hero.jsx")).toHaveLength(1);
    expect(
      chunks.filter(
        (c) => c.type === "file-complete" && c.path === "/Hero.jsx",
      ),
    ).toHaveLength(1);
  });

  it("stops requesting files once the signal is aborted", async () => {
    const controller = new AbortController();
    const filePrompts: string[] = [];
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([
            { path: "/Hero.jsx", description: "hero" },
            { path: "/Contact.jsx", description: "contact" },
          ]);
        }
        filePrompts.push(prompt);
        if (prompt.includes('path="/App.js"')) {
          controller.abort();
          return {
            code: "export default function App() { return null; }",
          };
        }
        return { code: "export default function X() { return null; }" };
      },
    );

    const chunks: TProjectStreamChunk[] = [];
    for await (const chunk of service.generateProject(
      dto,
      "u1",
      controller.signal,
    )) {
      chunks.push(chunk);
    }

    expect(filePrompts).toHaveLength(1);
    expect(
      chunks.some((c) => c.type === "file-complete" && c.path === "/App.js"),
    ).toBe(true);
    expect(chunks.at(-1)?.type).toBe("finish");
  });

  it("throws when the entry file cannot be generated", async () => {
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([]);
        }
        if (prompt.includes('path="/App.js"')) {
          throw new Error("nope");
        }
        return { code: "body {}" };
      },
    );

    await expect(
      collect(service.generateProject(dto, "u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses the file plan schema first and the file code schema per file", async () => {
    generateStructured.mockImplementation(({ schema }: IStructuredCall) =>
      schema === filePlanSchema
        ? plan([{ path: "/Hero.jsx", description: "hero" }])
        : { code: "export default function X() { return null; }" },
    );

    await collect(service.generateProject(dto, "u1"));

    const schemas = generateStructured.mock.calls.map(
      (call) => (call[0] as IStructuredCall).schema,
    );
    expect(schemas[0]).toBe(filePlanSchema);
    expect(schemas.slice(1).every((schema) => schema === fileCodeSchema)).toBe(
      true,
    );
  });

  it("passes planned exports/imports into the file prompt", async () => {
    const prompts: string[] = [];
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        prompts.push(prompt);
        return schema === filePlanSchema
          ? {
              files: [
                {
                  path: "/Hero.jsx",
                  description: "hero",
                  exports: ["Hero"],
                  imports: ["react"],
                },
              ],
              projectName: "Studio",
              projectDescription: "x",
            }
          : { code: "export default function Hero() { return null; }" };
      },
    );

    await collect(service.generateProject(dto, "u1"));

    const filePrompt = prompts.find((p) => p.includes('path="/Hero.jsx"'));
    expect(filePrompt).toContain("exports: Hero");
    expect(filePrompt).toContain("imports: react");
  });

  it("surfaces a quota message when the entry file fails", async () => {
    generateStructured.mockImplementation(
      ({ schema, prompt }: IStructuredCall) => {
        if (schema === filePlanSchema) {
          return plan([]);
        }
        if (prompt.includes('path="/App.js"')) {
          throw new HttpException("quota exceeded", 429);
        }
        return { code: "body {}" };
      },
    );

    await expect(collect(service.generateProject(dto, "u1"))).rejects.toThrow(
      "quota exceeded",
    );
  });
});
