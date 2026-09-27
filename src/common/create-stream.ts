import type { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";

export interface ISseStreamOptions<TChunk> {
  getSource: (signal: AbortSignal) => Promise<AsyncIterable<TChunk>>;
  mapChunk: (chunk: TChunk) => MessageEvent["data"];
  getErrorMessage?: (error: unknown) => string;
  finishData?: MessageEvent["data"];
}

export function createSseStream<TChunk>(
  options: ISseStreamOptions<TChunk>,
): Observable<MessageEvent> {
  const {
    getSource,
    mapChunk,
    getErrorMessage = () => "Something went wrong",
    finishData = { type: "finish" },
  } = options;

  return new Observable<MessageEvent>((subscriber) => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const stream = await getSource(controller.signal);

        for await (const chunk of stream) {
          if (cancelled) return;
          subscriber.next({ data: mapChunk(chunk) });
        }

        if (cancelled) return;
        subscriber.next({ data: finishData });
        subscriber.complete();
      } catch (error) {
        if (cancelled) return;
        subscriber.next({
          data: { type: "error", message: getErrorMessage(error) },
        });
        subscriber.complete();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  });
}
