import { BadRequestException, type MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { PortfolioController } from "../portfolio.controller";
import type { GenerateProjectDto, TProjectStreamChunk } from "../portfolio.dto";
import type { PortfolioService } from "../portfolio.service";

const collect = (obs: Observable<MessageEvent>): Promise<MessageEvent[]> =>
  new Promise((resolve, reject) => {
    const events: MessageEvent[] = [];
    obs.subscribe({
      next: (event) => {
        events.push(event);
      },
      error: reject,
      complete: () => {
        resolve(events);
      },
    });
  });

const dto = { prompt: "studio", provider: "google" } as GenerateProjectDto;

const controllerWith = (
  source: () => Generator<TProjectStreamChunk>,
): PortfolioController =>
  new PortfolioController({
    generateProject: source,
  } as unknown as PortfolioService);

describe("PortfolioController.generateProject", () => {
  it("streams the generator chunks and lets the generator own the finish event", async () => {
    const controller = controllerWith(function* () {
      yield { type: "plan", files: [{ path: "/App.js", description: "root" }] };
      yield { type: "file-complete", path: "/App.js", content: "code" };
      yield {
        type: "finish",
        files: { "/App.js": "code" },
        message: "done",
        failed: [],
      };
    });

    const events = await collect(controller.generateProject(dto, "u1"));

    expect(events.map((event) => event.data)).toEqual([
      { type: "plan", files: [{ path: "/App.js", description: "root" }] },
      { type: "file-complete", path: "/App.js", content: "code" },
      {
        type: "finish",
        files: { "/App.js": "code" },
        message: "done",
        failed: [],
      },
    ]);
  });

  it("maps a thrown HttpException to an error event using its message", async () => {
    const controller = controllerWith(function* () {
      yield { type: "plan", files: [] };
      throw new BadRequestException("could not generate the entry file");
    });

    const events = await collect(controller.generateProject(dto, "u1"));

    expect(events.map((event) => event.data)).toEqual([
      { type: "plan", files: [] },
      { type: "error", message: "could not generate the entry file" },
    ]);
  });

  it("falls back to a generic message for non-HTTP errors", async () => {
    const controller = controllerWith(function* () {
      throw new Error("kaboom");
    });

    const events = await collect(controller.generateProject(dto, "u1"));

    expect(events).toEqual([
      { data: { type: "error", message: "Could not generate the project" } },
    ]);
  });

  it("passes the dto, userId, and abort signal through to the service", async () => {
    const generateProject = vi.fn(function* () {
      return;
    });
    const controller = new PortfolioController({
      generateProject,
    } as unknown as PortfolioService);

    await collect(controller.generateProject(dto, "user-7"));

    expect(generateProject).toHaveBeenCalledWith(
      dto,
      "user-7",
      expect.any(AbortSignal),
    );
  });
});
