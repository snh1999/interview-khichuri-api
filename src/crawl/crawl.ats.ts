import { normalizeJobUrl } from "@/src/common/url";
import type { TCompany } from "@/src/database/database.types";

import {
  ATS_MAX_BODY_BYTES,
  CRAWL_MAX_PAGES,
  MAX_DESCRIPTION_LENGTH,
  MAX_EXTERNAL_ID_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
} from "./crawl.constants";
import type { TListingItem } from "./crawl.constants";
import { CrawlFetchError, safeFetch } from "./crawl.safe-fetch";
import { htmlToTextOfEscaped } from "./crawl.scrape";

/** Fixed hosts per provider: the board id is a slug, never a URL. */
export const ATS_BOARD_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

type TAtsProvider = "greenhouse" | "lever" | "ashby";
type TFetchPage = (url: string) => Promise<{ text: string }>;

interface IParsedPage {
  items: TListingItem[];
  hasMore: boolean;
}

const ATS_ENDPOINTS: Record<TAtsProvider, (boardId: string) => string> = {
  greenhouse: (boardId) =>
    `https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs?content=true`,
  lever: (boardId) => `https://api.lever.co/v0/postings/${boardId}?mode=json`,
  ashby: (boardId) =>
    `https://api.ashbyhq.com/posting-api/job-board/${boardId}`,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const toItem = ({
  externalId,
  url,
  title,
  location,
  description,
}: {
  externalId: unknown;
  url: unknown;
  title: unknown;
  location: unknown;
  description?: string | null;
}): TListingItem => {
  const rawExternalId =
    typeof externalId === "number"
      ? String(externalId)
      : firstString(externalId);
  if (!rawExternalId) {
    throw new CrawlFetchError("ATS listing is missing an external id");
  }
  if (rawExternalId.length > MAX_EXTERNAL_ID_LENGTH) {
    throw new CrawlFetchError("ATS listing has an over-long external id");
  }

  const rawUrl = firstString(url);
  const normalized = rawUrl ? normalizeJobUrl(rawUrl) : undefined;
  if (!normalized || normalized.length > MAX_URL_LENGTH) {
    throw new CrawlFetchError("ATS listing has an invalid job URL");
  }

  return {
    externalId: rawExternalId,
    url: normalized,
    title: (firstString(title) ?? normalized).slice(0, MAX_TITLE_LENGTH),
    location: firstString(location)?.slice(0, MAX_LOCATION_LENGTH) ?? null,
    description: description?.slice(0, MAX_DESCRIPTION_LENGTH) ?? null,
  };
};

const parseGreenhouse = (payload: unknown): IParsedPage => {
  const jobs = isRecord(payload) ? asArray(payload.jobs) : [];
  const items = jobs.filter(isRecord).map((job) => {
    const location = isRecord(job.location)
      ? firstString(job.location.name)
      : job.location;
    const content = firstString(job.content);

    return toItem({
      externalId: job.id,
      url: job.absolute_url,
      title: job.title,
      location,
      description: content ? htmlToTextOfEscaped(content) : null,
    });
  });

  return { items, hasMore: false };
};

/**
 * Lever splits a posting into an intro, a list of sections and a closing note;
 * `descriptionPlain` alone is only the intro, so a job stored from it would be
 * silently truncated and marked `ok`.
 */
const leverDescription = (job: Record<string, unknown>): string | null => {
  const parts: string[] = [];
  const introPlain = firstString(job.descriptionPlain);
  const introHtml = firstString(job.description);
  if (introPlain) parts.push(introPlain);
  else if (introHtml) parts.push(htmlToTextOfEscaped(introHtml));

  for (const entry of asArray(job.lists)) {
    if (!isRecord(entry)) continue;
    const content = firstString(entry.content);
    if (content) parts.push(htmlToTextOfEscaped(content));
  }

  const additionalPlain = firstString(job.additionalPlain);
  const additionalHtml = firstString(job.additional);
  if (additionalPlain) parts.push(additionalPlain);
  else if (additionalHtml) parts.push(htmlToTextOfEscaped(additionalHtml));

  return parts.join("\n\n") || null;
};

const parseLever = (payload: unknown): IParsedPage => {
  const jobs = asArray(payload);
  const items = jobs.filter(isRecord).map((job) => {
    const categories = isRecord(job.categories) ? job.categories : {};

    return toItem({
      externalId: job.id,
      url: job.hostedUrl,
      title: job.text,
      location: categories.location,
      description: leverDescription(job),
    });
  });

  return { items, hasMore: false };
};

const parseAshby = (payload: unknown): IParsedPage => {
  const jobs = isRecord(payload) ? asArray(payload.jobs) : [];
  // `isListed: false` is a hidden posting; discovery must not show it.
  const items = jobs
    .filter(isRecord)
    .filter((job) => job.isListed !== false)
    .map((job) => {
      const plain = firstString(job.descriptionPlain);
      const html = firstString(job.descriptionHtml);

      return toItem({
        externalId: job.id,
        url: job.jobUrl,
        title: job.title,
        location: job.location,
        description: plain ?? (html ? htmlToTextOfEscaped(html) : null),
      });
    });

  return { items, hasMore: false };
};

const parsePage = (provider: TAtsProvider, body: string): IParsedPage => {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new CrawlFetchError("ATS board returned invalid JSON");
  }

  switch (provider) {
    case "greenhouse":
      return parseGreenhouse(payload);
    case "lever":
      return parseLever(payload);
    case "ashby":
      return parseAshby(payload);
  }
};

/**
 * One crawl of an ATS board. Greenhouse/Lever/Ashby return the whole board in a
 * single response, so the page loop only ever runs once for them; it stays for
 * providers that paginate. A failed page fails the whole crawl.
 */
export const fetchAtsListing = async (
  company: TCompany,
  fetchPage: TFetchPage = (url) =>
    safeFetch(url, { maxBytes: ATS_MAX_BODY_BYTES }),
): Promise<TListingItem[]> => {
  const provider = company.provider;
  if (!provider || provider === "scrape") {
    throw new CrawlFetchError("Company is not configured for an ATS provider");
  }

  const boardId = company.atsBoardId ?? "";
  if (!ATS_BOARD_ID_REGEX.test(boardId)) {
    throw new CrawlFetchError("Company has no valid ATS board id");
  }

  const items: TListingItem[] = [];

  for (let page = 0; page < CRAWL_MAX_PAGES; page++) {
    const response = await fetchPage(ATS_ENDPOINTS[provider](boardId));
    const parsed = parsePage(provider, response.text);
    items.push(...parsed.items);
    if (!parsed.hasMore) return items;
  }

  throw new CrawlFetchError("ATS board exceeds the page cap");
};
