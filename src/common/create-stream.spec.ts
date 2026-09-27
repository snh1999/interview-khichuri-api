/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-empty-function -- these are deliberate async-iterable test doubles; requiring an `await` inside them would add noise, not coverage. */
import type { MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { createSseStream } from "./create-stream";

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

describe("createSseStream", () => {
  it("maps every chunk then emits the default finish event", async () => {
    const events = await collect(
      createSseStream<string>({
        getSource: async () =>
          (async function* () {
            yield "a";
            yield "b";
          })(),
        mapChunk: (text) => ({ type: "text", text }),
      }),
    );

    expect(events).toEqual([
      { data: { type: "text", text: "a" } },
      { data: { type: "text", text: "b" } },
      { data: { type: "finish" } },
    ]);
  });

  it("emits the custom finish payload when provided", async () => {
    const events = await collect(
      createSseStream<string>({
        getSource: async () => (async function* () {})(),
        mapChunk: (text) => ({ type: "text", text }),
        finishData: { type: "done", count: 0 },
      }),
    );

    expect(events).toEqual([{ data: { type: "done", count: 0 } }]);
  });

  // A source that resolves is still allowed to fail later while draining, so
  // the error event has to come from the iteration, not just the await.
  it("emits an error event when the source throws mid-stream, keeping chunks already sent", async () => {
    const events = await collect(
      createSseStream<string>({
        getSource: async () =>
          (async function* () {
            yield "a";
            throw new Error("provider exploded");
          })(),
        mapChunk: (text) => ({ type: "text", text }),
        getErrorMessage: () => "Could not generate explanation",
      }),
    );

    expect(events).toEqual([
      { data: { type: "text", text: "a" } },
      { data: { type: "error", message: "Could not generate explanation" } },
    ]);
  });

  it("emits an error event when acquiring the source itself fails, and skips finish", async () => {
    const events = await collect(
      createSseStream<string>({
        getSource: async () => {
          throw new Error("no key");
        },
        mapChunk: (text) => ({ type: "text", text }),
        getErrorMessage: (error) =>
          error instanceof Error ? error.message : "unknown",
      }),
    );

    expect(events).toEqual([{ data: { type: "error", message: "no key" } }]);
  });

  it("falls back to a generic error message when getErrorMessage is omitted", async () => {
    const events = await collect(
      createSseStream<string>({
        getSource: async () => {
          throw new Error("boom");
        },
        mapChunk: (text) => ({ type: "text", text }),
      }),
    );

    expect(events).toEqual([
      { data: { type: "error", message: "Something went wrong" } },
    ]);
  });

  it("passes a live (not yet aborted) abort signal to the source", async () => {
    let captured: AbortSignal | undefined;
    let abortedAtAcquire: boolean | undefined;

    await collect(
      createSseStream<string>({
        getSource: async (signal) => {
          captured = signal;
          abortedAtAcquire = signal.aborted;
          return (async function* () {})();
        },
        mapChunk: (text) => ({ type: "text", text }),
      }),
    );

    expect(captured).toBeInstanceOf(AbortSignal);
    expect(abortedAtAcquire).toBe(false);
  });

  // The guard is what stops a disconnected client from being written to. It only
  // works if the loop re-checks *after* every await, so this asserts on the chunk
  // that arrives post-abort rather than on the flag itself.
  it("aborts the source and drops chunks that arrive after unsubscribe", async () => {
    const events: MessageEvent[] = [];
    let captured: AbortSignal | undefined;

    const sub = createSseStream<string>({
      getSource: async (signal) => {
        captured = signal;
        return (async function* () {
          yield "a";
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => {
              resolve();
            });
          });
          yield "late";
        })();
      },
      mapChunk: (text) => ({ type: "text", text }),
    }).subscribe((event) => {
      events.push(event);
    });

    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });
    sub.unsubscribe();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(captured?.aborted).toBe(true);
    expect(events).toEqual([{ data: { type: "text", text: "a" } }]);
  });

  it("stays silent when the source throws after unsubscribe", async () => {
    const events: MessageEvent[] = [];
    let release: ((error: Error) => void) | undefined;

    const sub = createSseStream<string>({
      getSource: async () =>
        (async function* () {
          await new Promise<void>((resolve, reject) => {
            release = reject;
          });
          yield "never";
        })(),
      mapChunk: (text) => ({ type: "text", text }),
      getErrorMessage: () => "should not be seen",
    }).subscribe((event) => {
      events.push(event);
    });

    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });
    sub.unsubscribe();
    release?.(new Error("aborted"));
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(events).toEqual([]);
  });
});
