import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, Interval } from "@nestjs/schedule";

import { normalizeJobUrl } from "@/src/common/url";
import { IDatabaseService } from "@/src/database/database.service";
import type { TCompany, TJob, TJobInsert } from "@/src/database/database.types";

import { CrawlAiService } from "./crawl.ai";
import { ATS_BOARD_ID_REGEX, fetchAtsListing } from "./crawl.ats";
import {
  CLOSE_GUARD_MIN_OPEN,
  CLOSE_GUARD_RATIO,
  CRAWL_CADENCE_MS,
  CRAWL_FAILURE_BACKOFF_MS,
  CRAWL_TICK_MS,
  MAX_CRAWL_ERROR_LENGTH,
  MAX_EXTERNAL_ID_LENGTH,
  MAX_LINKS,
  MAX_URL_LENGTH,
  MAX_NEW_JOBS_PER_CRAWL,
  MISSED_CRAWLS_BEFORE_CLOSE,
  RETENTION_MS,
  cleanText,
  hashListing,
  toFeed,
} from "./crawl.constants";
import type { TListingItem } from "./crawl.constants";
import { CrawlDrainService } from "./crawl.drain.service";
import { CrawlFetchError, safeFetch } from "./crawl.safe-fetch";
import { extractAnchors, htmlToText, scrapeListing } from "./crawl.scrape";

interface ILoadedListing {
  items: TListingItem[];
  hash: string;
}

interface IUpsertPlan {
  updates: { id: string; data: Partial<TJobInsert> }[];
  inserts: TJobInsert[];
  matchedIds: Set<string>;
}

@Injectable()
export class CrawlService {
  private readonly logger = new Logger(CrawlService.name);

  /** Companies with a crawl in flight; a manual crawl can overlap the tick. */
  private readonly running = new Set<number>();
  /** Last attempt per company, for the failure backoff (never persisted). */
  private readonly lastAttempt = new Map<number, number>();

  public constructor(
    private readonly db: IDatabaseService,
    private readonly ai: CrawlAiService,
    private readonly drain: CrawlDrainService,
  ) {}

  @Interval(CRAWL_TICK_MS)
  public async runScheduledCrawl(): Promise<void> {
    if (process.env.IS_APP_MODE) return;

    for (const company of await this._dueCompanies()) {
      try {
        await this.crawlCompany(company.id);
      } catch (error) {
        // One company's failure must not stop the rest of the tick.
        this.logger.warn("Crawl failed", {
          companyId: company.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Retention sweep: system jobs nobody tracks, stale for 30 days. */
  @Cron("0 3 * * *")
  public async runSweep(): Promise<void> {
    if (process.env.IS_APP_MODE) return;

    const cutoff = Date.now() - RETENTION_MS;
    const candidates = await this.db.findAllByColumn("jobs", {
      filter: { userId: null },
    });
    const stale = candidates.filter((job) =>
      job.closedAt
        ? job.closedAt.getTime() < cutoff
        : (job.state === "none" || job.state === "failed") &&
          job.stateChangedAt.getTime() < cutoff,
    );
    if (stale.length === 0) return;

    const tracked = await this.db.findAllByColumn("tracked_jobs", {
      filter: { jobId: stale.map((job) => job.id) },
    });
    const trackedIds = new Set(tracked.map((track) => track.jobId));

    for (const job of stale) {
      if (trackedIds.has(job.id)) continue;

      try {
        await this.db.withTransaction(async (transaction) => {
          await this.db.delete(
            "jobs",
            { id: job.id, userId: null },
            false,
            transaction,
          );
        });
      } catch (error) {
        // The FK is deferred, so a track created after the fetch fails at
        // commit; that job is simply kept for the next sweep.
        this.logger.warn("Sweep kept a job that gained a track", {
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * One crawl of one company. `force` bypasses `enabled` and the close guard;
   * failures are recorded on the company. Scheduled crawls swallow the error;
   * `rethrow` (manual crawls) surfaces it to the HTTP caller.
   */
  public async crawlCompany(
    companyId: number,
    options: { force?: boolean; rethrow?: boolean } = {},
  ): Promise<void> {
    // TODO: in app mode this makes the manual crawl route return HTTP 204
    // without doing any work; report crawling as unavailable or hide the route.
    if (process.env.IS_APP_MODE) return;
    if (this.running.has(companyId)) {
      if (options.rethrow) {
        throw new ConflictException(
          "A crawl is already running for this company",
        );
      }
      return;
    }

    // Claim the slot before the first await: two callers (manual + tick) would
    // otherwise both pass the check and crawl the same company twice.
    this.running.add(companyId);
    try {
      const company = await this._findCompany(companyId);
      if (!company) {
        if (options.rethrow) throw new NotFoundException("Company not found");
        return;
      }
      if (!company.provider) {
        if (options.rethrow) {
          throw new BadRequestException("Company has no provider");
        }
        return;
      }
      if (options.rethrow) {
        const problem = this._sourceProblem(company);
        if (problem) throw new BadRequestException(problem);
      }
      if (!company.enabled && !options.force) return;

      await this.ai.refresh();
      this.lastAttempt.set(companyId, Date.now());
      const listing = await this._loadListing(company);
      await this._applyListing(company, listing, options.force === true);

      // A drain failure must not overwrite the crawl result with its own error.
      try {
        await this.drain.drainCompany(company);
      } catch (error) {
        this.logger.warn("Drain after crawl failed", {
          companyId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      // Request errors (missing company/source) are not crawl failures.
      if (!(error instanceof HttpException)) {
        await this._recordCrawlError(companyId, error);
      }
      if (options.rethrow) {
        if (error instanceof HttpException) throw error;
        throw new BadGatewayException(
          error instanceof Error ? error.message : "Crawl failed",
        );
      }
    } finally {
      this.running.delete(companyId);
    }
  }

  /** Why a manual crawl cannot start, or null when the source is configured. */
  private _sourceProblem(company: TCompany): string | null {
    if (company.provider === "scrape") {
      return company.careerPageUrl ? null : "Company has no career page URL";
    }
    return ATS_BOARD_ID_REGEX.test(company.atsBoardId ?? "")
      ? null
      : "Company has no valid ATS board id";
  }

  private async _findCompany(companyId: number): Promise<TCompany | null> {
    try {
      return await this.db.findById("companies", companyId);
    } catch {
      return null;
    }
  }

  private async _dueCompanies(): Promise<TCompany[]> {
    const companies = await this.db.findAllByColumn("companies");
    const now = Date.now();
    const cutoff = now - CRAWL_CADENCE_MS;

    return companies.filter((company) => {
      if (!company.enabled || !company.provider) return false;
      // A company that was never crawled is due immediately.
      if (company.crawledAt && company.crawledAt.getTime() >= cutoff) {
        return false;
      }

      // Failures leave `crawledAt` untouched, so they need their own backoff
      // or a broken board would be retried on every tick.
      const lastAttempt = this.lastAttempt.get(company.id);
      return !(
        company.crawlError &&
        lastAttempt !== undefined &&
        now - lastAttempt < CRAWL_FAILURE_BACKOFF_MS
      );
    });
  }

  private async _loadListing(company: TCompany): Promise<ILoadedListing> {
    if (company.provider === "scrape") {
      return this._loadScrapedListing(company);
    }

    const items = await fetchAtsListing(company);

    return this._toListing(items);
  }

  private _toListing(rawItems: TListingItem[]): ILoadedListing {
    // Postgres text and jsonb both reject a NUL byte, and the feed, the hash
    // and the inserts share these values: clean once, at the boundary. Identity
    // fields are re-validated here because ATS, scrape and AI all feed this.
    const items = rawItems.map((item) => {
      const url = normalizeJobUrl(item.url);
      if (!url || url.length > MAX_URL_LENGTH) {
        throw new CrawlFetchError("Listing has an invalid job URL");
      }
      const externalId =
        item.externalId === null ? null : cleanText(item.externalId);
      if (externalId && externalId.length > MAX_EXTERNAL_ID_LENGTH) {
        throw new CrawlFetchError("Listing has an over-long external id");
      }

      return {
        ...item,
        externalId,
        url,
        title: cleanText(item.title),
        location: item.location === null ? null : cleanText(item.location),
        description:
          item.description === null ? null : cleanText(item.description),
      };
    });

    if (items.length > MAX_LINKS) {
      throw new CrawlFetchError(
        `Listing has ${items.length} links, over the ${MAX_LINKS} cap`,
      );
    }

    return { items, hash: hashListing(items) };
  }

  private async _loadScrapedListing(
    company: TCompany,
  ): Promise<ILoadedListing> {
    if (!company.careerPageUrl) {
      throw new CrawlFetchError("Company has no career page URL");
    }

    const page = await safeFetch(company.careerPageUrl);
    const items = scrapeListing(page.text, page.url);

    if (items.length === 0) {
      // Deterministic zero: one AI fallback over every same-host link, never a
      // hash skip. Job-shaped anchors are empty here, so the candidate set is
      // built with `anyPath`; the AI gets sanitized text, not raw markup.
      if (!this.ai.isAvailable()) {
        throw new CrawlFetchError("AI unavailable");
      }

      const aiItems = await this.ai.extractListing(
        htmlToText(page.text),
        extractAnchors(page.text, page.url, true),
      );
      if (!aiItems.ok) {
        throw new CrawlFetchError(
          aiItems.retryable
            ? "AI unavailable"
            : "No job listings found on the career page",
        );
      }
      if (aiItems.value.length === 0) {
        throw new CrawlFetchError("No job listings found on the career page");
      }
      return this._toListing(aiItems.value);
    }

    return this._toListing(items);
  }

  /**
   * Diffs the listing against the stored jobs.
   */
  private async _applyListing(
    company: TCompany,
    listing: ILoadedListing,
    force: boolean,
  ): Promise<void> {
    // Always diff the freshly fetched items: the stored feed omits descriptions, so using it on a hash match would discard them.
    const items = listing.items;

    const existing = await this.db.findAllByColumn("jobs", {
      filter: { companyId: company.id, userId: null },
    });
    const { updates, inserts, matchedIds } = this._planUpserts(
      company,
      existing,
      items,
      force,
    );

    if (company.crawledAt && inserts.length > MAX_NEW_JOBS_PER_CRAWL) {
      throw new CrawlFetchError(
        `Crawl would insert ${inserts.length} new jobs, over the ${MAX_NEW_JOBS_PER_CRAWL} cap`,
      );
    }

    const openCount = existing.filter((job) => !job.closedAt).length;
    const misses = existing
      .filter((job) => !job.closedAt && !matchedIds.has(job.id))
      .map((job) => ({ id: job.id, missedCrawls: job.missedCrawls + 1 }));
    const closeCount = misses.filter(
      (miss) => miss.missedCrawls >= MISSED_CRAWLS_BEFORE_CLOSE,
    ).length;
    const guarded =
      !force &&
      openCount >= CLOSE_GUARD_MIN_OPEN &&
      closeCount > openCount * CLOSE_GUARD_RATIO;

    const now = new Date();

    await this.db.withTransaction(async (transaction) => {
      for (const { id, data } of updates) {
        await this.db.update("jobs", data, { id }, transaction);
      }
      for (const data of inserts) {
        await this.db.create("jobs", data, transaction);
      }
      for (const miss of misses) {
        const close =
          !guarded && miss.missedCrawls >= MISSED_CRAWLS_BEFORE_CLOSE;
        await this.db.update(
          "jobs",
          close
            ? { missedCrawls: miss.missedCrawls, closedAt: now }
            : { missedCrawls: miss.missedCrawls },
          { id: miss.id },
          transaction,
        );
      }

      // A guard trip writes the error only: no feed, hash or crawledAt, so the
      // next crawl re-diffs instead of hash-matching and hiding the problem.
      await this.db.update(
        "companies",
        guarded
          ? {
              crawlError: `Close guard tripped: ${closeCount} of ${openCount} open jobs would close. Force a crawl to confirm.`,
            }
          : {
              feed: toFeed(items),
              hash: listing.hash,
              crawledAt: now,
              crawlError: null,
            },
        { id: company.id },
        transaction,
      );
    });
  }

  private _planUpserts(
    company: TCompany,
    existing: TJob[],
    items: TListingItem[],
    requeueFailed: boolean,
  ): IUpsertPlan {
    const isScrape = company.provider === "scrape";
    const byExternalId = new Map<string, TJob>();
    const byUrl = new Map<string, TJob>();

    for (const job of existing) {
      if (job.externalId) byExternalId.set(job.externalId, job);
      if (job.url) byUrl.set(job.url, job);
    }

    const feedExternalIds = new Set(
      items
        .map((item) => item.externalId)
        .filter((externalId): externalId is string => externalId !== null),
    );

    const updates: { id: string; data: Partial<TJobInsert> }[] = [];
    const inserts: TJobInsert[] = [];
    const matchedIds = new Set<string>();
    const seenUrls = new Set<string>();
    const seenExternalIds = new Set<string>();
    const now = new Date();

    for (const item of items) {
      if (!isScrape && !item.externalId) {
        throw new CrawlFetchError("ATS listing is missing an external id");
      }
      if (seenUrls.has(item.url)) {
        throw new CrawlFetchError(`Listing repeats the URL ${item.url}`);
      }
      seenUrls.add(item.url);

      if (!isScrape && item.externalId) {
        if (seenExternalIds.has(item.externalId)) {
          throw new CrawlFetchError(
            `Listing repeats the external id ${item.externalId}`,
          );
        }
        seenExternalIds.add(item.externalId);
      }

      const match = isScrape
        ? byUrl.get(item.url)
        : item.externalId
          ? byExternalId.get(item.externalId)
          : undefined;

      // The partial (company_id, url) unique covers ATS too: a URL that
      // belongs to a different system job fails the crawl, never duplicates.
      const collision = byUrl.get(item.url);
      if (collision && collision.id !== match?.id) {
        // A re-listed job (or a provider switch) can reuse the URL of a row
        // that is leaving the feed. That row keeps the URL after it closes, so
        // deferring the insert would hit the unique index forever; adopt the
        // row instead and keep its tracks.
        const leaving =
          collision.externalId === null ||
          !feedExternalIds.has(collision.externalId);
        if (!isScrape && !match && leaving) {
          matchedIds.add(collision.id);
          updates.push({
            id: collision.id,
            data: {
              externalId: item.externalId,
              provider: company.provider,
              title: item.title,
              location: item.location,
              description: item.description,
              state: item.description ? "ok" : "none",
              stateChangedAt: now,
              missedCrawls: 0,
              closedAt: null,
            },
          });
          continue;
        }
        throw new CrawlFetchError(
          `Job URL ${item.url} already belongs to another system job`,
        );
      }

      if (match) {
        matchedIds.add(match.id);
        // Only write what changed: a full-table rewrite every crawl also bumps
        // `updatedAt` for jobs nothing happened to.
        const data: Partial<TJobInsert> = {};
        if (match.missedCrawls !== 0) data.missedCrawls = 0;
        if (match.closedAt) data.closedAt = null;
        if (!isScrape) {
          if (match.url !== item.url) data.url = item.url;
          if (match.title !== item.title) data.title = item.title;
          if (match.location !== item.location) {
            data.location = item.location;
          }
          // A description that arrived with the listing saves the drain a
          // fetch; an existing AI description is never overwritten.
          if (item.description && match.state === "none") {
            data.description = item.description;
            data.state = "ok";
            data.stateChangedAt = now;
          }
        }
        // A manual "Crawl now" also retries failed drains for jobs still in
        // the listing; the drain then works through them at its own pace.
        if (requeueFailed && match.state === "failed") {
          if (item.description) {
            data.description = item.description;
            data.state = "ok";
          } else {
            data.state = "none";
          }
          data.stateChangedAt = now;
        }
        if (Object.keys(data).length > 0) updates.push({ id: match.id, data });
        continue;
      }

      const description = item.description;

      inserts.push({
        companyId: company.id,
        companyName: company.name,
        provider: company.provider,
        // Scrape matches by URL; a JSON-LD identifier is not stable and the
        // (company, provider, external_id) unique would fail the whole crawl.
        externalId: isScrape ? null : item.externalId,
        url: item.url,
        title: item.title,
        location: item.location,
        description,
        userId: null,
        state: description ? "ok" : "none",
        stateChangedAt: now,
      });
    }

    return { updates, inserts, matchedIds };
  }

  private async _recordCrawlError(
    companyId: number,
    error: unknown,
  ): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error))
      .replace(/[\u0000-\u001f]+/gu, " ")
      .trim()
      .slice(0, MAX_CRAWL_ERROR_LENGTH);

    this.logger.warn("Crawl failed", { companyId, message });
    // Silent: the company may have been deleted mid-crawl, and a failed recording must not escape and abort the scheduled loop.
    await this.db.update(
      "companies",
      { crawlError: message },
      { id: companyId },
      undefined,
      true,
    );
  }
}
