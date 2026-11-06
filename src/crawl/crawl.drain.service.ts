import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";

import { IDatabaseService } from "@/src/database/database.service";
import type { TCompany, TJob } from "@/src/database/database.types";

import { CrawlAiService } from "./crawl.ai";
import {
  DRAIN_COMPANY_THROTTLE_MS,
  DRAIN_MAX_PAGES_PER_RUN,
  DRAIN_PAGE_SIZE,
  DRAIN_TICK_MS,
  MAX_DESCRIPTION_LENGTH,
  MIN_PLAIN_DESCRIPTION,
  cleanText,
} from "./crawl.constants";
import { safeFetch } from "./crawl.safe-fetch";
import {
  extractJobPostingDescription,
  extractMainText,
  htmlToText,
} from "./crawl.scrape";

/**
 * Fills `jobs.description` for crawled jobs, one job per company per minute.
 * Runs for paused (`enabled = false`) companies too: `enabled` only stops the
 * scheduled listing fetch, while a manual crawl can still have queued jobs.
 */
@Injectable()
export class CrawlDrainService {
  private readonly logger = new Logger(CrawlDrainService.name);

  private readonly cursors = new Map<number, number>();
  private readonly lastRun = new Map<number, number>();
  /** Jobs that need AI while it is paused/disabled; cleared when it is back. */
  private readonly skipped = new Set<string>();
  private draining = false;

  public constructor(
    private readonly db: IDatabaseService,
    private readonly ai: CrawlAiService,
  ) {}

  @Interval(DRAIN_TICK_MS)
  public async runScheduledDrain(): Promise<void> {
    if (process.env.IS_APP_MODE) return;
    if (this.draining) return;

    this.draining = true;
    try {
      // One indexed count, so an enable/retry can never leave the drain idle
      // the way a cached "pending" flag did.
      const pending = await this.db.count("jobs", {
        userId: null,
        state: "none",
        closedAt: null,
      });
      if (pending === 0) return;

      await this.ai.refresh();

      const companies = await this.db.findAllByColumn("companies");
      for (const company of companies) {
        if (!company.provider) continue;
        // One broken company must not stall the others' backlog.
        try {
          await this.drainCompany(company);
        } catch (error) {
          this.logger.warn("Drain failed for a company", {
            companyId: company.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * One job per company per minute. Returns whether the company may still have
   * `none` jobs, so the caller can keep the drain awake.
   */
  public async drainCompany(company: TCompany): Promise<boolean> {
    if (process.env.IS_APP_MODE) return false;
    // `enabled` only pauses scheduled listing fetches; a manual crawl still
    // inserts jobs, so their descriptions must be allowed to drain.
    if (!company.provider) return false;

    const companyId = company.id;
    const lastRun = this.lastRun.get(companyId) ?? 0;
    // Throttled means unknown, not empty: assume work may remain.
    if (Date.now() - lastRun < DRAIN_COMPANY_THROTTLE_MS - 1000) return true;
    // Claim before the first await: the post-crawl call and the scheduled tick
    // can otherwise both pass the throttle and process the same job.
    this.lastRun.set(companyId, Date.now());

    if (this.ai.isAvailable()) {
      this.skipped.clear();
    }

    let offset = this.cursors.get(companyId) ?? 0;

    for (let pages = 0; pages < DRAIN_MAX_PAGES_PER_RUN; pages++) {
      const page = await this.db.findAllByColumn("jobs", {
        filter: { companyId, userId: null, state: "none", closedAt: null },
        // Postgres `now()` is the transaction start, so a crawl's inserts share
        // one `created_at`; `id` makes the OFFSET paging stable.
        sortBy: [
          { column: "createdAt", order: "asc" },
          { column: "id", order: "asc" },
        ],
        pagination: { limit: DRAIN_PAGE_SIZE, offset },
      });

      if (page.length === 0) {
        if (offset === 0) return false;
        offset = 0;
        this.cursors.set(companyId, 0);
        continue;
      }

      const job = page.find((entry) => !this.skipped.has(entry.id));
      if (job) {
        // Processed jobs leave `none` and shift the page, so only the entries
        // before this one are known to be skipped.
        this.cursors.set(companyId, offset + page.indexOf(job));
        await this._drainJob(job);
        return true;
      }

      offset += page.length;
      this.cursors.set(companyId, offset);

      if (page.length < DRAIN_PAGE_SIZE) {
        this.cursors.set(companyId, 0);
        return true;
      }
    }

    return true;
  }

  private async _drainJob(job: TJob): Promise<void> {
    if (!job.url) {
      await this._fail(job.id);
      return;
    }

    try {
      const page = await safeFetch(job.url);
      const description = this._descriptionOf(page.text);

      if (description) {
        await this._succeed(job.id, description);
        return;
      }

      if (!this.ai.isAvailable()) {
        this.skipped.add(job.id);
        return;
      }

      // AI gets text, never raw markup: the first 30k of an HTML page is
      // <head>, scripts and boilerplate, and the plan requires sanitized input.
      const aiDescription = await this.ai.extractDescription(
        (extractMainText(page.text) ?? htmlToText(page.text)).trim(),
      );
      if (aiDescription.ok) {
        await this._succeed(job.id, aiDescription.value);
        return;
      }

      // A 429 (or a key that vanished mid-call) leaves the job `none`.
      if (aiDescription.retryable) {
        this.skipped.add(job.id);
        return;
      }

      await this._fail(job.id);
    } catch (error) {
      this.logger.warn("Could not drain job", {
        jobId: job.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this._fail(job.id);
    }
  }

  private _descriptionOf(html: string): string | null {
    const posting = extractJobPostingDescription(html);
    if (posting) return posting.slice(0, MAX_DESCRIPTION_LENGTH);

    // Every page has nav and footers, so the whole-page fallback is not a
    // description: a JS shell would be stored as `ok` junk. Only a real
    // posting body counts; everything else goes to the AI (or stays `none`).
    const plain = extractMainText(html)?.trim() ?? "";
    return plain.length >= MIN_PLAIN_DESCRIPTION
      ? plain.slice(0, MAX_DESCRIPTION_LENGTH)
      : null;
  }

  private async _succeed(jobId: string, description: string): Promise<void> {
    await this.db.update(
      "jobs",
      {
        description: cleanText(description),
        state: "ok",
        stateChangedAt: new Date(),
      },
      { id: jobId, state: "none" },
      undefined,
      true,
    );
  }

  private async _fail(jobId: string): Promise<void> {
    await this.db.update(
      "jobs",
      { state: "failed", stateChangedAt: new Date() },
      { id: jobId, state: "none" },
      undefined,
      true,
    );
  }
}
