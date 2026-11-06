import { brotliCompressSync, gzipSync } from "node:zlib";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  lookup: vi.fn(),
  agentClose: vi.fn(),
  agent: vi.fn(),
}));

vi.mock("undici", () => ({
  request: mocks.request,
  Agent: function AgentMock(this: unknown, options: unknown) {
    mocks.agent(options);
    return { close: mocks.agentClose };
  },
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import { safeFetch } from "../crawl.safe-fetch";

const bodyOfBytes = (buffer: Buffer) => {
  const chunks = [buffer];
  return {
    dump: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/require-await -- a fetch body is an async iterable
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
};

const bodyOf = (text: string) => bodyOfBytes(Buffer.from(text));

const responseOf = ({
  statusCode = 200,
  contentType = "text/html; charset=utf-8",
  body = bodyOf("<html>ok</html>"),
  location,
}: {
  statusCode?: number;
  contentType?: string;
  body?: ReturnType<typeof bodyOf>;
  location?: string;
}) => ({
  statusCode,
  headers: {
    "content-type": contentType,
    ...(location ? { location } : {}),
  },
  body,
});

describe("safeFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("rejects non-https URLs", async () => {
    await expect(safeFetch("http://example.com/jobs")).rejects.toThrow(
      "Only https URLs",
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects private IP literals", async () => {
    await expect(safeFetch("https://127.0.0.1/jobs")).rejects.toThrow(
      "Host is not allowed",
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to a private address", async () => {
    mocks.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      "Host is not allowed",
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("returns the body for an allowed content type", async () => {
    mocks.request.mockResolvedValue(
      responseOf({ body: bodyOf("<html>jobs</html>") }),
    );

    await expect(safeFetch("https://careers.example.com")).resolves.toEqual({
      url: "https://careers.example.com/",
      contentType: "text/html",
      text: "<html>jobs</html>",
    });
  });

  it("rejects unsupported content types", async () => {
    mocks.request.mockResolvedValue(
      responseOf({ contentType: "image/png", body: bodyOf("png") }),
    );

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      'Unsupported content type "image/png"',
    );
  });

  it("caps the expanded body after decompression", async () => {
    const compressed = gzipSync(Buffer.from("x".repeat(2 * 1024 * 1024 + 1)));
    mocks.request.mockResolvedValue({
      ...responseOf({ body: bodyOfBytes(compressed) }),
      headers: { "content-type": "text/html", "content-encoding": "gzip" },
    });

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      "2 MB cap",
    );
  });

  it("decodes gzip and brotli bodies", async () => {
    mocks.request.mockResolvedValueOnce({
      ...responseOf({
        body: bodyOfBytes(gzipSync(Buffer.from("<html>gz</html>"))),
      }),
      headers: { "content-type": "text/html", "content-encoding": "gzip" },
    });
    mocks.request.mockResolvedValueOnce({
      ...responseOf({
        body: bodyOfBytes(brotliCompressSync(Buffer.from("<html>br</html>"))),
      }),
      headers: { "content-type": "text/html", "content-encoding": "br" },
    });

    await expect(
      safeFetch("https://careers.example.com"),
    ).resolves.toMatchObject({
      text: "<html>gz</html>",
    });
    await expect(
      safeFetch("https://careers.example.com"),
    ).resolves.toMatchObject({
      text: "<html>br</html>",
    });
  });

  it("rejects when the response body errors mid-stream", async () => {
    const body = {
      dump: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/require-await -- a fetch body is an async iterable
      async *[Symbol.asyncIterator]() {
        yield gzipSync(Buffer.from("<html>ok</html>"));
        throw new Error("socket reset");
      },
    };
    mocks.request.mockResolvedValue({
      ...responseOf({ body }),
      headers: { "content-type": "text/html", "content-encoding": "gzip" },
    });

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      "Could not decode gzip body",
    );
  });

  it("rejects a content encoding it cannot decode", async () => {
    mocks.request.mockResolvedValue({
      ...responseOf({}),
      headers: { "content-type": "text/html", "content-encoding": "zstd" },
    });

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      'Unsupported content encoding "zstd"',
    );
  });

  it("maps a deadline timeout to a fetch error", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.request.mockRejectedValue(timeout);

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      "Fetch timed out",
    );
  });

  it("bounds DNS resolution by the fetch deadline", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    try {
      mocks.lookup.mockReturnValue(
        new Promise<never>(() => {
          // A hung DNS lookup never settles.
        }),
      );

      const pending = safeFetch("https://careers.example.com");
      controller.abort();

      await expect(pending).rejects.toThrow("Fetch timed out");
      expect(mocks.request).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });

  it("accepts an identity content encoding", async () => {
    mocks.request.mockResolvedValue({
      ...responseOf({}),
      headers: { "content-type": "text/html", "content-encoding": "identity" },
    });

    await expect(
      safeFetch("https://careers.example.com"),
    ).resolves.toMatchObject({ text: "<html>ok</html>" });
  });

  it("re-validates every redirect target", async () => {
    mocks.request.mockResolvedValueOnce(
      responseOf({ statusCode: 302, location: "https://127.0.0.1/admin" }),
    );

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      "Host is not allowed",
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("follows at most three redirects", async () => {
    mocks.request.mockResolvedValue(
      responseOf({
        statusCode: 302,
        location: "https://careers.example.com/x",
      }),
    );

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      "Too many redirects",
    );
    expect(mocks.request).toHaveBeenCalledTimes(4);
  });

  it("rejects non-2xx responses", async () => {
    mocks.request.mockResolvedValue(
      responseOf({ statusCode: 500, body: bodyOf("nope") }),
    );

    await expect(safeFetch("https://careers.example.com")).rejects.toThrow(
      "status 500",
    );
  });

  it("pins the socket to the address it validated", async () => {
    mocks.request.mockResolvedValue(responseOf({}));

    await safeFetch("https://careers.example.com/jobs");

    const options = mocks.agent.mock.calls[0][0] as {
      connect: {
        lookup: (
          host: string,
          options: { all?: boolean },
          callback: (...args: unknown[]) => void,
        ) => void;
      };
    };
    const callback = vi.fn();
    options.connect.lookup("careers.example.com", {}, callback);

    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });
});
