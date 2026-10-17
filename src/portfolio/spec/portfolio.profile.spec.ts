import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenAiService } from "@/src/gen-ai/gen-ai.service";
import type { ProfileService } from "@/src/profile/profile.service";

import {
  designContentSchema,
  filePlanSchema,
  type GenerateSketchDto,
  type TProjectStreamChunk,
} from "../portfolio.dto";
import { PortfolioService } from "../portfolio.service";

interface IStructuredCall {
  prompt: string;
  schema: unknown;
}

interface IPromptPage {
  route: string;
  elements: unknown[];
}

const profile = {
  id: "u1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+1 555",
  country: "UK",
  location: "London",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-02T00:00:00Z"),
  links: [{ id: 1, profileId: "u1", label: "GitHub", url: "https://g" }],
  workOverviews: [
    {
      id: 1,
      profileId: "u1",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      title: "Analytical Engine Programmer",
      summary: "Ships small diffs",
      skills: [
        {
          id: 1,
          workId: 1,
          topicId: 10,
          topic: { id: 10, name: "TypeScript" },
        },
      ],
      industries: [
        {
          id: 1,
          workId: 1,
          industryId: 20,
          industry: { id: 20, name: "Fintech" },
        },
      ],
    },
  ],
  workExperiences: [
    { id: 1, profileId: "u1", companyId: 5, company: "Acme", title: "Eng" },
  ],
  educations: [{ id: 1, profileId: "u1", school: "Cambridge" }],
  jobPreferences: [{ id: 1, profileId: "u1", titles: [] }],
  publications: [{ id: 1, profileId: "u1", title: "Notes", authors: "Ada" }],
  projects: [
    {
      id: 1,
      profileId: "u1",
      name: "Engine",
      skills: [
        {
          id: 1,
          projectId: 1,
          topicId: 10,
          topic: { id: 10, name: "TypeScript" },
        },
      ],
    },
  ],
  references: [{ id: 1, profileId: "u1", name: "Charles" }],
  activities: [{ id: 1, profileId: "u1", title: "Speaker" }],
};

const sketchDto = {
  prompt: "minimal portfolio",
  provider: "google",
  frames: [{ id: "f1", title: "Home", route: "/" }],
  elements: [],
  theme: {},
} as unknown as GenerateSketchDto;

const projectDto = { prompt: "genesis", provider: "google" } as const;

const collect = async (
  chunks: AsyncGenerator<TProjectStreamChunk>,
): Promise<TProjectStreamChunk[]> => {
  const results: TProjectStreamChunk[] = [];
  for await (const chunk of chunks) {
    results.push(chunk);
  }
  return results;
};

describe("PortfolioService profile injection", () => {
  let generateStructured: ReturnType<typeof vi.fn>;
  let getPortfolioProfile: ReturnType<typeof vi.fn>;
  let service: PortfolioService;
  let prompts: string[];

  beforeEach(() => {
    prompts = [];
    getPortfolioProfile = vi.fn().mockResolvedValue(profile);
    generateStructured = vi.fn(({ prompt, schema }: IStructuredCall) => {
      prompts.push(prompt);
      if (schema === designContentSchema) {
        return {
          routes: ["/"],
          files: {
            "/App.js": "export default function App() { return null; }",
            "/styles.css": "",
          },
          wireframeSummary: {
            elementCount: 0,
            detectedLayout: "single column",
            sections: [],
          },
        };
      }
      if (schema === filePlanSchema) {
        return {
          files: [{ path: "/App.js", description: "entry" }],
          projectName: "Studio",
          projectDescription: "A studio portfolio",
        };
      }
      return { code: "export default function X() { return <div />; }" };
    });
    service = new PortfolioService(
      { generateStructured } as unknown as GenAiService,
      { getPortfolioProfile } as unknown as ProfileService,
    );
  });

  it("embeds the packed profile in the sketch prompt", async () => {
    await service.generateSketch(sketchDto, "u1");

    const [prompt] = prompts;
    expect(prompt).toContain("<profile>");
    expect(prompt).toContain('"firstName":"Ada"');
    expect(prompt).toContain('"skills":["TypeScript"]');
    expect(prompt).toContain('"industries":["Fintech"]');
    expect(prompt).not.toContain("profileId");
    expect(prompt).not.toContain('"phone"');
    expect(prompt).not.toContain("jobPreferences");
    expect(prompt).not.toContain('"references"');
  });

  it("dedups artboards that share a route into one page", async () => {
    await service.generateSketch(
      {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...sketchDto,
        frames: [
          { id: "f1", title: "Home Desktop", route: "/" },
          { id: "f2", title: "Home Mobile", route: "/" },
        ],
        elements: [
          { id: "e1", frameId: "f1", type: "text" },
          { id: "e2", frameId: "f2", type: "text" },
        ],
      },
      "u1",
    );

    const [prompt] = prompts;
    const pages = JSON.parse(
      /<pages>(\[[\s\S]*?\])<\/pages>/.exec(prompt)?.[1] ?? "[]",
    ) as IPromptPage[];
    expect(pages).toHaveLength(1);
    expect(pages[0].route).toBe("/");
    expect(pages[0].elements).toHaveLength(2);
  });

  it("keeps distinct routes as distinct pages", async () => {
    await service.generateSketch(
      {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...sketchDto,
        frames: [
          { id: "f1", title: "Home", route: "/" },
          { id: "f2", title: "About", route: "/about" },
        ],
      },
      "u1",
    );

    const [prompt] = prompts;
    const pages = JSON.parse(
      /<pages>(\[[\s\S]*?\])<\/pages>/.exec(prompt)?.[1] ?? "[]",
    ) as IPromptPage[];
    expect(pages.map((p) => p.route)).toEqual(["/", "/about"]);
  });

  it("embeds the profile in the plan and in every file prompt", async () => {
    await collect(service.generateProject(projectDto, "u1"));

    expect(prompts.length).toBeGreaterThan(1);
    expect(prompts.every((prompt) => prompt.includes("<profile>"))).toBe(true);
  });

  it("degrades to <profile>null</profile> when the user has no profile", async () => {
    getPortfolioProfile.mockResolvedValue(null);

    await collect(service.generateProject(projectDto, "u1"));

    expect(
      prompts.every((prompt) => prompt.includes("<profile>null</profile>")),
    ).toBe(true);
  });
});
