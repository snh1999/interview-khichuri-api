import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { generateText } from "ai";
import { z } from "zod";

import { normalizeJobUrl } from "@/src/common/url";
import type { TApiKeyProvider } from "@/src/database/database.types";
import { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import {
  PROVIDER_CONFIG,
  providerBaseUrl,
} from "@/src/gen-ai/gen-ai.constants";
import { safeProviderFetch } from "@/src/gen-ai/provider-url";

import type { ICrawlAiCandidate, ICrawlAiOwner } from "./crawl.ai-owner";
import { CrawlAiOwnerService } from "./crawl.ai-owner";
import {
  AI_BACKOFF_MS,
  AI_DESCRIPTION_PROMPT,
  AI_LISTING_PROMPT,
  AI_REQUEST_TIMEOUT_MS,
  MAX_AI_ANCHORS,
  MAX_AI_INPUT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_TITLE_LENGTH,
} from "./crawl.constants";
import type { TListingItem } from "./crawl.constants";
import type { TAnchor } from "./crawl.scrape";

const listingSchema = z.object({
  jobs: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      location: z.string().nullish(),
    }),
  ),
});

const descriptionSchema = z.object({ description: z.string() });

export type TCrawlAiResult<T> =
  { ok: true; value: T } | { ok: false; retryable: boolean };

export type TCrawlAiReason =
  "ok" | "no-admin" | "no-key" | "key-rejected" | "paused";

export interface ICrawlAiStatus {
  enabled: boolean;
  pausedUntil: string | null;
  ownerEmail: string | null;
  provider: TApiKeyProvider | null;
  model: string | null;
  reason: TCrawlAiReason;
}

interface ISkipState {
  keyId: string;
  updatedAt: number;
  rejected: boolean;
  pausedUntil: number | null;
  backoffStep: number;
}

const PAUSED = Symbol("paused");

const isRateLimited = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const status =
    (error as { status?: number }).status ??
    (error as { statusCode?: number }).statusCode;
  return status === 429;
};

/**
 * Anything that is not an explicit 4xx is worth retrying: 5xx, timeouts and
 * network errors all come back on a later tick. A 4xx (bad key, bad prompt)
 * will not, so those still fail the job.
 */
const isTransient = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return true;
  const status =
    (error as { status?: number }).status ??
    (error as { statusCode?: number }).statusCode;
  return typeof status !== "number" || status >= 500;
};

const errorStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  return (
    (error as { status?: number }).status ??
    (error as { statusCode?: number }).statusCode
  );
};

/** A provider error body can echo key material, so only these fields are logged. */
const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const nested = (error as { data?: { error?: { code?: unknown } } }).data
    ?.error?.code;
  return typeof nested === "string" ? nested : undefined;
};

const errorBody = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return "";
  const { message, responseBody, data } = error as Record<string, unknown>;
  const parts = [
    typeof message === "string" ? message : "",
    typeof responseBody === "string" ? responseBody : "",
  ];
  try {
    if (data !== undefined) parts.push(JSON.stringify(data));
  } catch {
    // An unstringifiable payload cannot name an invalid key either.
  }
  return parts.join("\n");
};

/**
 * Google names the reset window in the quota id (`...PerDay...`), OpenAI uses
 * `insufficient_quota`. Anything else that is a 429 is a per-minute limit.
 */
const DAILY_QUOTA_PATTERN = /per[\s_-]?day|daily|insufficient_quota/iu;

const isDailyQuotaExhausted = (error: unknown): boolean =>
  DAILY_QUOTA_PATTERN.test(errorBody(error));

const isInvalidKey = (error: unknown): boolean => {
  const status = errorStatus(error);
  if (status === 401 || status === 403) return true;
  return (
    status === 400 &&
    /API_KEY_INVALID|api key not valid/iu.test(errorBody(error))
  );
};

const parseJson = <T>(text: string, schema: z.ZodType<T>): T | null => {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");

  try {
    const parsed = schema.safeParse(JSON.parse(trimmed));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const pacificOffsetMs = (date: Date): number => {
  const label =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT-08:00";
  const match = /GMT([+-])(\d{2}):(\d{2})/u.exec(label);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
};

/**
 * Next midnight Pacific Time as a UTC instant. Google's free-tier daily quota
 * resets at midnight PT, so the pause follows that clock and not UTC: pausing
 * to UTC midnight would either idle AI for hours or resume into the same
 * exhausted window. `America/Los_Angeles` is the IANA id for PT (PST/PDT).
 */
export const nextMidnightPacific = (now: Date = new Date()): Date => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);

  const localMidnight = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day") + 1,
  );

  // Two passes so a DST change on the target day does not shift the result.
  const firstPass = localMidnight - pacificOffsetMs(new Date(localMidnight));
  return new Date(localMidnight - pacificOffsetMs(new Date(firstPass)));
};

/**
 * Crawler AI on the owner admin's active `api_key` rows: one candidate per
 * provider, `GEN_AI_PROVIDERS` order, key material read per call. Pause and
 * rejection state is in memory and per key id, so it never blocks interactive
 * AI and one bad key does not disable the others.
 */
@Injectable()
export class CrawlAiService {
  private readonly logger = new Logger(CrawlAiService.name);
  private readonly skip = new Map<string, ISkipState>();
  private owner: ICrawlAiOwner | null | undefined;
  private candidates: ICrawlAiCandidate[] = [];

  public constructor(
    private readonly ownerService: CrawlAiOwnerService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  /** Re-resolves the owner and its candidate keys. Call once per run. */
  public async refresh(): Promise<void> {
    this.owner = await this.ownerService.resolveOwner();
    this.candidates = this.owner
      ? await this.ownerService.candidates(this.owner.id)
      : [];

    const live = new Set(this.candidates.map(({ keyId }) => keyId));
    for (const keyId of this.skip.keys()) {
      if (!live.has(keyId)) this.skip.delete(keyId);
    }
  }

  public isEnabled(): boolean {
    return (
      this.owner !== null &&
      this.owner !== undefined &&
      this.candidates.length > 0
    );
  }

  /** At least one candidate is neither rejected nor paused. */
  public isAvailable(now: number = Date.now()): boolean {
    return this.candidates.some((candidate) => {
      const state = this._entry(candidate);
      return !state.rejected && !this._paused(state, now);
    });
  }

  /** Every candidate is paused (not merely rejected). */
  public isPaused(now: number = Date.now()): boolean {
    return (
      this.candidates.length > 0 &&
      this.candidates.every((candidate) => {
        const state = this._entry(candidate);
        return !state.rejected && this._paused(state, now);
      })
    );
  }

  public async status(now: Date = new Date()): Promise<ICrawlAiStatus> {
    const owner = await this.ownerService.resolveOwner();
    if (!owner) {
      return {
        enabled: false,
        pausedUntil: null,
        ownerEmail: null,
        provider: null,
        model: null,
        reason: "no-admin",
      };
    }

    const candidates = await this.ownerService.candidates(owner.id);
    if (candidates.length === 0) {
      return {
        enabled: false,
        pausedUntil: null,
        ownerEmail: owner.email,
        provider: null,
        model: null,
        reason: "no-key",
      };
    }

    const at = now.getTime();
    const states = candidates.map((candidate) => ({
      candidate,
      state: this._entry(candidate),
    }));
    const available = states.find(
      ({ state }) => !state.rejected && !this._paused(state, at),
    );
    const first = candidates[0];

    if (available) {
      return {
        enabled: true,
        pausedUntil: null,
        ownerEmail: owner.email,
        provider: available.candidate.provider,
        model: modelOf(available.candidate),
        reason: "ok",
      };
    }

    const paused = states.filter(({ state }) => this._paused(state, at));
    if (states.every(({ state }) => state.rejected)) {
      return {
        enabled: false,
        pausedUntil: null,
        ownerEmail: owner.email,
        provider: first.provider,
        model: modelOf(first),
        reason: "key-rejected",
      };
    }

    return {
      enabled: false,
      pausedUntil:
        paused.length > 0
          ? new Date(
              Math.min(...paused.map(({ state }) => state.pausedUntil ?? 0)),
            ).toISOString()
          : null,
      ownerEmail: owner.email,
      provider: first.provider,
      model: modelOf(first),
      reason: "paused",
    };
  }

  /** Listing fallback. Output URLs must already exist in the anchor set. */
  public async extractListing(
    pageText: string,
    anchors: TAnchor[],
  ): Promise<TCrawlAiResult<TListingItem[]>> {
    if (anchors.length === 0) return { ok: false, retryable: false };

    // Titles travel with the URLs: the model cannot map a job title to a bare
    // URL, and the page text is sanitized so the anchor text may be all it has.
    const allowed = anchors
      .slice(0, MAX_AI_ANCHORS)
      .map(({ url, title }) => `${url}\t${title}`)
      .join("\n");
    const result = await this._generate(
      listingSchema,
      `${AI_LISTING_PROMPT}\n\n<allowed_urls>\n${allowed}\n</allowed_urls>\n\n<page_text>\n${pageText.slice(0, MAX_AI_INPUT_LENGTH)}\n</page_text>`,
    );
    if (!result.ok) return result;

    const allowedUrls = new Set(anchors.map(({ url }) => url));
    const items: TListingItem[] = [];
    const seen = new Set<string>();

    for (const job of result.value.jobs) {
      const url = normalizeJobUrl(job.url);
      if (!url || !allowedUrls.has(url) || seen.has(url)) continue;

      seen.add(url);
      items.push({
        externalId: null,
        url,
        title: job.title.slice(0, MAX_TITLE_LENGTH),
        location: job.location?.slice(0, MAX_LOCATION_LENGTH) ?? null,
        description: null,
      });
    }

    return { ok: true, value: items };
  }

  public async extractDescription(
    pageText: string,
  ): Promise<TCrawlAiResult<string>> {
    const result = await this._generate(
      descriptionSchema,
      `${AI_DESCRIPTION_PROMPT}\n\n<page_text>\n${pageText.slice(0, MAX_AI_INPUT_LENGTH)}\n</page_text>`,
    );
    if (!result.ok) return result;

    const description = result.value.description.trim();
    return description
      ? { ok: true, value: description.slice(0, MAX_DESCRIPTION_LENGTH) }
      : { ok: false, retryable: false };
  }

  private async _generate<T>(
    schema: z.ZodType<T>,
    prompt: string,
  ): Promise<TCrawlAiResult<T>> {
    if (this.owner === undefined) await this.refresh();
    if (!this.owner || this.candidates.length === 0) {
      return { ok: false, retryable: true };
    }

    let sawPause = false;
    let sawHard = false;
    for (const candidate of this.candidates) {
      const cached = this._entry(candidate);
      if (cached.rejected) continue;
      if (this._paused(cached)) {
        sawPause = true;
        continue;
      }

      const outcome = await this._tryCandidate(
        candidate,
        schema,
        prompt,
        this.owner.id,
      );
      if (outcome === PAUSED) {
        sawPause = true;
        continue;
      }
      if (outcome === "hard") {
        sawHard = true;
        continue;
      }
      return { ok: true, value: outcome };
    }

    // A hard 4xx on every usable key fails the job; any pause stays retryable.
    return { ok: false, retryable: sawPause || !sawHard };
  }

  private async _tryCandidate<T>(
    candidate: ICrawlAiCandidate,
    schema: z.ZodType<T>,
    prompt: string,
    ownerId: string,
  ): Promise<T | "hard" | typeof PAUSED> {
    try {
      return await this.apiKeys.useApiKey(
        candidate.provider,
        async (creds) => {
          const state = this._entryFor(creds.id, creds.updatedAt.getTime());
          if (state.rejected || this._paused(state)) return PAUSED;

          return this._request(
            candidate.provider,
            creds,
            schema,
            prompt,
            state,
          );
        },
        ownerId,
      );
    } catch (error) {
      // Deleted mid-run (or never there): the next candidate gets the call.
      if (error instanceof NotFoundException) return PAUSED;
      throw error;
    }
  }

  private async _request<T>(
    provider: TApiKeyProvider,
    creds: { key: string; model: string | null; baseUrl: string | null },
    schema: z.ZodType<T>,
    prompt: string,
    state: ISkipState,
  ): Promise<T | "hard" | typeof PAUSED> {
    const config = PROVIDER_CONFIG[provider];
    const modelName = creds.model ?? config.defaultModel;
    const providerInstance =
      config.sdk === "google"
        ? createGoogle({ apiKey: creds.key })
        : createOpenAI({
            apiKey: creds.key,
            baseURL: providerBaseUrl(provider, creds.baseUrl),
            fetch: safeProviderFetch,
          });

    try {
      const { text } = await generateText({
        model: providerInstance(modelName),
        prompt,
        maxOutputTokens: 4096,
        // One call per attempt: the SDK's own retries would multiply a 429.
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      });
      const parsed = parseJson(text, schema);
      if (!parsed) return "hard";

      this.skip.delete(state.keyId);
      return parsed;
    } catch (error) {
      return this._handleFailure(provider, state, error);
    }
  }

  private _handleFailure(
    provider: TApiKeyProvider,
    state: ISkipState,
    error: unknown,
  ): "hard" | typeof PAUSED {
    this.logger.warn("Crawler AI request failed", {
      provider,
      status: errorStatus(error),
      code: errorCode(error),
    });

    if (isInvalidKey(error)) {
      state.rejected = true;
      state.pausedUntil = null;
      return PAUSED;
    }

    if (isRateLimited(error) || isTransient(error)) {
      if (isDailyQuotaExhausted(error)) {
        state.pausedUntil = nextMidnightPacific().getTime();
        state.backoffStep = 0;
      } else {
        this._pause(state);
      }
      return PAUSED;
    }

    return "hard";
  }

  private _pause(state: ISkipState): void {
    const delay =
      AI_BACKOFF_MS[Math.min(state.backoffStep, AI_BACKOFF_MS.length - 1)];
    state.backoffStep = Math.min(
      state.backoffStep + 1,
      AI_BACKOFF_MS.length - 1,
    );

    const until = Date.now() + delay;
    if (state.pausedUntil === null || until > state.pausedUntil) {
      state.pausedUntil = until;
    }
  }

  private _paused(state: ISkipState, now: number = Date.now()): boolean {
    return state.pausedUntil !== null && state.pausedUntil > now;
  }

  private _entry(candidate: ICrawlAiCandidate): ISkipState {
    return this._entryFor(candidate.keyId, candidate.updatedAt);
  }

  private _entryFor(keyId: string, updatedAt: number): ISkipState {
    const existing = this.skip.get(keyId);
    if (existing?.updatedAt === updatedAt) return existing;

    // A rotated/edited key starts clean: its old pause or rejection no longer
    // applies. The id is the key, `updatedAt` is the version.
    const fresh: ISkipState = {
      keyId,
      updatedAt,
      rejected: false,
      pausedUntil: null,
      backoffStep: 0,
    };
    this.skip.set(keyId, fresh);
    return fresh;
  }
}

const modelOf = (candidate: ICrawlAiCandidate): string =>
  candidate.model ?? PROVIDER_CONFIG[candidate.provider].defaultModel;
