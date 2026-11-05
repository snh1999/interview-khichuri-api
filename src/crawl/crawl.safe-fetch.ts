import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { Agent, request } from "undici";

import { isBlockedHostname, isPrivateIp } from "@/src/gen-ai/provider-url";

import {
  ALLOWED_CONTENT_TYPES,
  CRAWL_USER_AGENT,
  FETCH_DEADLINE_MS,
  MAX_BODY_BYTES,
  MAX_REDIRECTS,
} from "./crawl.constants";

export class CrawlFetchError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CrawlFetchError";
  }
}

export interface TFetchResult {
  url: string;
  contentType: string;
  text: string;
}

interface IPinnedHost {
  ip: string;
  family: number;
}

const parseHttpsUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CrawlFetchError("URL is not valid");
  }

  if (url.protocol !== "https:") {
    throw new CrawlFetchError("Only https URLs can be crawled");
  }
  if (url.username || url.password) {
    throw new CrawlFetchError("URL must not include credentials");
  }
  url.hash = "";
  return url;
};

/** Resolves once and pins the address the socket may connect to. */
const resolvePublicHost = async (url: URL): Promise<IPinnedHost> => {
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");

  if (isBlockedHostname(hostname)) {
    throw new CrawlFetchError("Host is not allowed");
  }

  const literal = isIP(hostname);
  if (literal) {
    if (isPrivateIp(hostname)) {
      throw new CrawlFetchError("Host is not allowed");
    }
    return { ip: hostname, family: literal };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, order: "verbatim" });
  } catch {
    throw new CrawlFetchError("Host could not be resolved");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new CrawlFetchError("Host is not allowed");
  }

  return { ip: addresses[0].address, family: addresses[0].family };
};

const pinnedAgent = ({ ip, family }: IPinnedHost): Agent =>
  new Agent({
    connect: {
      // undici hands this to net.connect, which asks for a single address.
      lookup: (_hostname, options, callback) => {
        if ((options as { all?: boolean }).all) {
          (
            callback as unknown as (
              error: Error | null,
              addresses: { address: string; family: number }[],
            ) => void
          )(null, [{ address: ip, family }]);
          return;
        }
        (
          callback as unknown as (
            error: Error | null,
            address: string,
            family: number,
          ) => void
        )(null, ip, family);
      },
    },
  });

const readCappedBody = async (
  body: AsyncIterable<Buffer | Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of body) {
    if (signal.aborted) {
      throw new CrawlFetchError("Fetch timed out");
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new CrawlFetchError(
        `Response body exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB cap`,
      );
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const DECODERS = {
  br: createBrotliDecompress,
  deflate: createInflate,
  gzip: createGunzip,
  "x-gzip": createGunzip,
} as const;

const decodeBody = (
  body: AsyncIterable<Buffer | Uint8Array>,
  encoding: string,
): AsyncIterable<Buffer | Uint8Array> => {
  if (!encoding || encoding === "identity") return body;

  const decoder = DECODERS[encoding as keyof typeof DECODERS];
  return Readable.from(body).pipe(decoder());
};

/**
 * Fetches a public https URL: no private addresses, redirects revalidated one
 * hop at a time, 10s total deadline, 2 MB cap after decompression by default.
 */
export const safeFetch = async (
  rawUrl: string,
  options: { maxBytes?: number } = {},
): Promise<TFetchResult> => {
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  let url = parseHttpsUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const agent = pinnedAgent(await resolvePublicHost(url));

    try {
      const response = await request(url, {
        dispatcher: agent,
        signal: deadline,
        headers: {
          "user-agent": CRAWL_USER_AGENT,
          accept: ALLOWED_CONTENT_TYPES.join(", "),
        },
      });

      const location = response.headers.location;
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        typeof location === "string"
      ) {
        await response.body.dump();
        url = parseHttpsUrl(new URL(location, url).toString());
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.body.dump();
        throw new CrawlFetchError(
          `Fetch failed with status ${response.statusCode}`,
        );
      }

      const contentType = String(response.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
        await response.body.dump();
        throw new CrawlFetchError(`Unsupported content type "${contentType}"`);
      }

      // undici's `request` does not decompress; decode gzip/brotli/deflate
      // ourselves so the byte cap applies to the expanded body.
      const encoding = String(response.headers["content-encoding"] ?? "")
        .trim()
        .toLowerCase();
      if (
        encoding &&
        encoding !== "identity" &&
        !Object.hasOwn(DECODERS, encoding)
      ) {
        await response.body.dump();
        throw new CrawlFetchError(`Unsupported content encoding "${encoding}"`);
      }

      try {
        return {
          url: url.toString(),
          contentType,
          text: await readCappedBody(
            decodeBody(response.body, encoding),
            maxBytes,
            deadline,
          ),
        };
      } catch (error) {
        if (error instanceof CrawlFetchError) throw error;
        throw new CrawlFetchError(`Could not decode ${encoding} body`);
      }
    } catch (error) {
      if (error instanceof CrawlFetchError) throw error;
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new CrawlFetchError("Fetch timed out");
      }
      throw new CrawlFetchError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await agent.close();
    }
  }

  throw new CrawlFetchError("Too many redirects");
};
