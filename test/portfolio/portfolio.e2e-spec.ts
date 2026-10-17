import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type supertest from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AppModule } from "@/src/app.module";
import { IDatabaseService } from "@/src/database/database.service";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { fileCodeSchema, filePlanSchema } from "@/src/portfolio/portfolio.dto";

const parseSse = <T>(body: string): T[] =>
  body
    .replaceAll("\r\n", "\n")
    .split("\n\n")
    .map((frame) =>
      frame
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim(),
    )
    .filter((payload): payload is string => Boolean(payload))
    .map((payload) => JSON.parse(payload) as T);

import { getTestAuthHeader } from "../utils/auth-helpers";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Portfolio AI (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let genAiMock: { generateStructured: ReturnType<typeof vi.fn> };

  const theme = {
    id: "theme-1",
    name: "Midnight Indigo",
    primaryColor: "#6366f1",
    secondaryColor: "#4f46e5",
    accentColor: "#ec4899",
    backgroundColor: "#090d16",
    surfaceColor: "#0f172a",
    textColor: "#f8fafc",
    textMutedColor: "#94a3b8",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    borderRadius: "md",
    styleMood: "modern",
  };

  const sketchBody = {
    prompt: "Dark minimal portfolio for a frontend engineer",
    frames: [{ id: "frame-1", title: "Home", route: "/" }],
    elements: [
      { id: "el-1", type: "stamp", stampType: "project", frameId: "frame-1" },
    ],
    theme,
    provider: "openai",
  };

  const designContent = {
    wireframeSummary: {
      elementCount: 1,
      detectedLayout: "single column",
      sections: ["Hero", "Projects"],
    },
    routes: ["/"],
    files: {
      "/App.js": "export default function App() {\n  return null;\n}",
      "/styles.css": "",
    },
  };

  interface TSketchResponse {
    id: string;
    routes: string[];
    createdAt: string;
    prompt?: string;
    themeUsed: typeof theme;
    wireframeSummary: typeof designContent.wireframeSummary;
    files: Record<string, string>;
    previewType: string;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GenAiService)
      .useValue({ generateStructured: vi.fn() })
      .compile();

    app = module.createNestApplication();
    const http = app.getHttpServer();
    await app.init();

    httpServer = request(http as Parameters<typeof request>[0]);
    dbService = app.get<IDatabaseService>(IDatabaseService);
    genAiMock = app.get<GenAiService>(GenAiService) as unknown as {
      generateStructured: ReturnType<typeof vi.fn>;
    };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await dbService.dbClear();
    if (!isAppMode) {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      authCookie = cookie;
    }
  });

  const auth = (req: supertest.Test): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", authCookie);
  };

  describe("POST /portfolio/sketch", () => {
    it("assembles a full GeneratedDesign around the model content", async () => {
      genAiMock.generateStructured.mockResolvedValue(designContent);

      const { body } = await auth(httpServer.post("/portfolio/sketch"))
        .send(sketchBody)
        .expect(200);

      expect(body.statusCode).toBe(200);
      const design = body.data as TSketchResponse;
      expect(design.id).toMatch(/^design-/);
      expect(design.routes).toEqual(["/"]);
      expect(design.createdAt).toBeTruthy();
      expect(design.prompt).toBe(sketchBody.prompt);
      expect(design.themeUsed).toEqual(theme);
      expect(design.previewType).toBe("interactive");
      expect(design.wireframeSummary).toEqual(designContent.wireframeSummary);
      expect(design.files).toEqual(designContent.files);

      const args = genAiMock.generateStructured.mock.calls[0][0] as {
        prompt: string;
        provider: string;
        schema: unknown;
        userId: string;
      };
      expect(args.provider).toBe("openai");
      expect(typeof args.userId).toBe("string");
      expect(args.schema).toBeDefined();
      expect(args.prompt).toContain(sketchBody.prompt);
      expect(args.prompt).toContain('"frame-1"');
      expect(args.prompt).toContain('"styleMood":"modern"');
    });

    it("falls back to the default prompt when the prompt is empty", async () => {
      genAiMock.generateStructured.mockResolvedValue(designContent);

      const { body } = await auth(httpServer.post("/portfolio/sketch"))
        .send({ ...sketchBody, prompt: "" })
        .expect(200);

      expect((body.data as TSketchResponse).prompt).toBe(
        "Generate clean high-impact portfolio from wireframe sketch",
      );
    });

    it("rejects a theme with an unknown styleMood", async () => {
      await auth(httpServer.post("/portfolio/sketch"))
        .send({ ...sketchBody, theme: { ...theme, styleMood: "grunge" } })
        .expect(400);

      expect(genAiMock.generateStructured).not.toHaveBeenCalled();
    });

    it("rejects a missing provider", async () => {
      const { provider: _ignored, ...withoutProvider } = sketchBody;
      await auth(httpServer.post("/portfolio/sketch"))
        .send(withoutProvider)
        .expect(400);
    });
  });

  describe("POST /portfolio/builder", () => {
    const builderOperations = {
      operations: [
        {
          op: "update",
          path: "/App.js",
          search: "// old",
          replace: "// new",
        },
      ],
      message: "Added the hero section",
    };

    it("applies the model operations to the sent files", async () => {
      genAiMock.generateStructured.mockResolvedValue(builderOperations);

      const { body } = await auth(httpServer.post("/portfolio/builder"))
        .send({
          prompt: "Add a hero section",
          files: { "/App.js": "// old" },
          provider: "google",
        })
        .expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data).toEqual({
        files: { "/App.js": "// new" },
        message: "Added the hero section",
        applied: ["updated /App.js"],
      });

      const args = genAiMock.generateStructured.mock.calls[0][0] as {
        prompt: string;
        provider: string;
      };
      expect(args.provider).toBe("google");
      expect(args.prompt).toContain("Add a hero section");
      expect(args.prompt).toContain('"/App.js"');
    });

    it("can delete a file listed only in the manifest", async () => {
      genAiMock.generateStructured.mockResolvedValue({
        operations: [{ op: "delete", path: "/Old.jsx" }],
        message: "Removed",
      });

      const { body } = await auth(httpServer.post("/portfolio/builder"))
        .send({
          prompt: "remove the old page",
          files: { "/App.js": "// old" },
          manifest: [{ path: "/App.js" }, { path: "/Old.jsx" }],
          provider: "google",
        })
        .expect(200);

      expect(body.data).toEqual({
        files: { "/App.js": "// old" },
        message: "Removed",
        applied: ["deleted /Old.jsx"],
      });
    });

    it("includes the manifest in the model prompt", async () => {
      genAiMock.generateStructured.mockResolvedValue({
        operations: [],
        message: "ok",
      });

      await auth(httpServer.post("/portfolio/builder"))
        .send({
          prompt: "hi",
          files: { "/App.js": "// old" },
          manifest: [{ path: "/App.js", hash: "abc123", size: 7 }],
          provider: "google",
        })
        .expect(200);

      const args = genAiMock.generateStructured.mock.calls[0][0] as {
        prompt: string;
      };
      expect(args.prompt).toContain("<manifest>");
      expect(args.prompt).toContain("/App.js (abc123, 7B)");
    });

    it("reports unapplied operations in the message", async () => {
      genAiMock.generateStructured.mockResolvedValue({
        operations: [
          { op: "update", path: "/App.js", search: "gone", replace: "x" },
        ],
        message: "Tried",
      });

      const { body } = await auth(httpServer.post("/portfolio/builder"))
        .send({
          prompt: "tweak",
          files: { "/App.js": "// old" },
          provider: "google",
        })
        .expect(200);

      const data = body.data as {
        files: Record<string, string>;
        message: string;
        applied: string[];
      };
      expect(data.files).toEqual({ "/App.js": "// old" });
      expect(data.applied).toEqual([]);
      expect(data.message).toContain("Tried");
      expect(data.message).toContain("search string not found");
    });

    it("rejects a request with more than 40 files", async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 41; i += 1) {
        files[`/file-${i}.js`] = "// code";
      }

      await auth(httpServer.post("/portfolio/builder"))
        .send({ prompt: "refactor", files, provider: "google" })
        .expect(400);

      expect(genAiMock.generateStructured).not.toHaveBeenCalled();
    });

    it("returns 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer
        .post("/portfolio/builder")
        .send({ prompt: "hi", files: {}, provider: "google" })
        .expect(401);
    });
  });

  describe("POST /portfolio/generate", () => {
    const plan = {
      files: [{ path: "/Hero.jsx", description: "Hero section" }],
      projectName: "Studio",
      projectDescription: "A studio portfolio",
    };

    it("streams a plan, each file, and a finish event over SSE", async () => {
      genAiMock.generateStructured.mockImplementation(
        ({ schema }: { schema: unknown }) =>
          schema === filePlanSchema
            ? plan
            : { code: "export default function X() { return null; }" },
      );

      const { text } = await auth(httpServer.post("/portfolio/generate"))
        .send({ prompt: "studio portfolio", provider: "google" })
        .expect(200);

      const events = parseSse<{ type: string; [key: string]: unknown }>(text);
      expect(events[0]).toEqual({
        type: "plan",
        files: [
          { path: "/App.js", description: expect.any(String) },
          { path: "/Hero.jsx", description: "Hero section" },
          { path: "/styles.css", description: expect.any(String) },
        ],
      });
      expect(
        events
          .filter((event) => event.type === "file-complete")
          .map((event) => event.path),
      ).toEqual(
        expect.arrayContaining(["/App.js", "/Hero.jsx", "/styles.css"]),
      );

      const finish = events.find((event) => event.type === "finish");
      expect(finish?.message).toEqual(expect.any(String));
      expect(
        Object.keys(finish?.files as Record<string, string>).sort(),
      ).toEqual(["/App.js", "/Hero.jsx", "/styles.css"]);
    });

    it("uses the file code schema for each generated file", async () => {
      genAiMock.generateStructured.mockImplementation(
        ({ schema }: { schema: unknown }) =>
          schema === filePlanSchema
            ? plan
            : { code: "export default function X() { return null; }" },
      );

      await auth(httpServer.post("/portfolio/generate"))
        .send({ prompt: "studio", provider: "google" })
        .expect(200);

      const schemas = genAiMock.generateStructured.mock.calls.map(
        (call) => (call[0] as { schema: unknown }).schema,
      );
      expect(schemas[0]).toBe(filePlanSchema);
      expect(
        schemas.slice(1).every((schema) => schema === fileCodeSchema),
      ).toBe(true);
    });

    it("rejects a missing provider", async () => {
      await auth(httpServer.post("/portfolio/generate"))
        .send({ prompt: "studio" })
        .expect(400);

      expect(genAiMock.generateStructured).not.toHaveBeenCalled();
    });
  });
});
