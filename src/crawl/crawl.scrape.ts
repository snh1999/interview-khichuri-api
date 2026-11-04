import { parseDocument } from "htmlparser2";

import { normalizeJobUrl } from "@/src/common/url";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_DOM_DEPTH,
  MAX_JSON_BLOCK_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
} from "./crawl.constants";
import type { TListingItem } from "./crawl.constants";

const NOISE_TAGS = new Set([
  "head",
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "form",
  "svg",
  "template",
]);
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "br",
  "li",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "article",
  "header",
  "footer",
  "table",
  "ul",
  "ol",
]);
/**
 * A keyword followed by a segment. Bare `/careers` and `/apply` are nav links,
 * not postings; treating them as jobs stored the listing page as a description.
 */
const JOB_PATH_REGEX =
  /(?:^|\/)(?:jobs?|careers?|positions?|openings?|vacanc(?:y|ies))\/[^/]+/i;
/**
 * Embedded boards keep every posting on the listing path and carry the id in
 * the query (`company.com/careers?gh_jid=123`), so the path alone is not enough.
 */
const JOB_QUERY_REGEX = /[?&](?:gh_jid|job[_-]?id|jobid|posting[_-]?id)=/iu;
/** Tags that only appear when a board shipped escaped HTML. */
const MARKUP_HINT =
  /<(?:a|p|br|div|ul|ol|li|h[1-6]|strong|em|span|table|thead|tbody|tr|td|section|article|header|footer)\b[^>]*>/iu;

/** Structural view of htmlparser2's DOM; keeps the walker free of domhandler types. */
interface INode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: INode[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const normalizeWhitespace = (value: string): string =>
  value
    .replace(/\r\n?/gu, "\n")
    .replace(/\u0000/gu, "")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

/** True when both values normalize to the same page, query included. */
const samePage = (value: string, baseUrl: string): boolean => {
  const left = normalizeJobUrl(value);
  return left !== undefined && left === normalizeJobUrl(baseUrl);
};

const sameHost = (value: string, baseUrl: string): boolean => {
  try {
    return (
      new URL(value).hostname.toLowerCase() ===
      new URL(baseUrl).hostname.toLowerCase()
    );
  } catch {
    return false;
  }
};

const parse = (html: string): INode => parseDocument(html);

const textOf = (nodes: INode[]): string => {
  const out: string[] = [];

  const visit = (node: INode, depth: number): void => {
    if (depth > MAX_DOM_DEPTH) return;

    if (node.type === "text") {
      out.push(node.data ?? "");
      return;
    }
    if (node.type !== "tag" && node.type !== "root") return;

    const name = node.name?.toLowerCase() ?? "";
    if (name && NOISE_TAGS.has(name)) return;

    const block = BLOCK_TAGS.has(name);
    if (block) out.push("\n");
    for (const child of node.children ?? []) visit(child, depth + 1);
    if (block) out.push("\n");
  };

  for (const node of nodes) visit(node, 0);
  return out.join("");
};

const findFirst = (
  nodes: INode[],
  predicate: (node: INode) => boolean,
  depth = 0,
): INode | null => {
  if (depth > MAX_DOM_DEPTH) return null;

  for (const node of nodes) {
    if (predicate(node)) return node;
    const found = findFirst(node.children ?? [], predicate, depth + 1);
    if (found) return found;
  }
  return null;
};

/**
 * Strips the page down to text. Parsing decodes entities exactly once, so
 * `List&lt;String&gt;` stays `List<String>` instead of vanishing as a tag.
 */
export const htmlToText = (html: string): string =>
  normalizeWhitespace(textOf(parse(html).children ?? [])).slice(
    0,
    MAX_DESCRIPTION_LENGTH,
  );

/**
 * Greenhouse (and some JSON-LD feeds) ship HTML-escaped HTML, which parses to
 * literal tag text. A second pass only runs when known tags survived the first.
 */
export const htmlToTextOfEscaped = (value: string): string => {
  const once = htmlToText(value);
  return MARKUP_HINT.test(once) ? htmlToText(once) : once;
};

/** The posting body only, for pages where the whole page is mostly chrome. */
export const extractMainText = (html: string): string | null => {
  const main = findFirst(
    parse(html).children ?? [],
    (node) => node.name === "main" || node.name === "article",
  );
  if (!main) return null;

  const text = normalizeWhitespace(textOf(main.children ?? []));
  return text || null;
};

const isJobPosting = (record: Record<string, unknown>): boolean => {
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (entry) =>
      typeof entry === "string" && entry.toLowerCase() === "jobposting",
  );
};

const collectJobPostings = (
  value: unknown,
  depth: number,
  out: Record<string, unknown>[],
): void => {
  if (depth > MAX_DOM_DEPTH) return;

  if (Array.isArray(value)) {
    for (const entry of value) collectJobPostings(entry, depth + 1, out);
    return;
  }
  if (!isRecord(value)) return;

  if (isJobPosting(value)) out.push(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "description") continue;
    collectJobPostings(child, depth + 1, out);
  }
};

export const extractJobPostings = (html: string): Record<string, unknown>[] => {
  const postings: Record<string, unknown>[] = [];

  const scripts: INode[] = [];
  const visit = (node: INode, depth: number): void => {
    if (depth > MAX_DOM_DEPTH) return;
    if (node.name === "script") {
      const type = node.attribs?.type;
      if (type?.trim().toLowerCase() === "application/ld+json") {
        scripts.push(node);
      }
      return;
    }
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  for (const node of parse(html).children ?? []) visit(node, 0);

  for (const script of scripts) {
    const raw = (script.children ?? [])
      .map((child) => (child.type === "text" ? (child.data ?? "") : ""))
      .join("")
      .trim();
    if (!raw || raw.length > MAX_JSON_BLOCK_LENGTH) continue;

    try {
      collectJobPostings(JSON.parse(raw), 0, postings);
    } catch {
      // A broken block must not fail the page; the anchors are still usable.
    }
  }

  return postings;
};

const locationOf = (posting: Record<string, unknown>): string | null => {
  const raw = posting.jobLocation;
  const entries = Array.isArray(raw) ? raw : [raw];

  for (const entry of entries) {
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim().slice(0, MAX_LOCATION_LENGTH);
    }
    if (!isRecord(entry)) continue;

    const address = entry.address;
    if (typeof address === "string" && address.trim()) {
      return address.trim().slice(0, MAX_LOCATION_LENGTH);
    }
    if (isRecord(address)) {
      const parts = [
        address.addressLocality,
        address.addressRegion,
        address.addressCountry,
      ].filter(
        (part): part is string => typeof part === "string" && Boolean(part),
      );
      if (parts.length > 0) {
        return parts.join(", ").slice(0, MAX_LOCATION_LENGTH);
      }
    }

    const name = firstString(entry.name);
    if (name) return name.slice(0, MAX_LOCATION_LENGTH);
  }

  return null;
};

const externalIdOf = (posting: Record<string, unknown>): string | null => {
  const identifier = posting.identifier;
  if (typeof identifier === "string") return identifier.trim() || null;
  if (isRecord(identifier)) {
    return firstString(identifier.value, identifier.name) ?? null;
  }
  return null;
};

const urlOf = (posting: Record<string, unknown>): string | undefined => {
  const raw = posting.url;
  if (isRecord(raw)) return firstString(raw["@id"], raw.url);
  return firstString(raw);
};

const postingToItem = (
  posting: Record<string, unknown>,
  baseUrl: string,
): TListingItem | null => {
  const url = urlOf(posting);
  const normalized = url ? normalizeJobUrl(url) : undefined;
  if (!normalized || normalized.length > MAX_URL_LENGTH) return null;
  // JSON-LD is page data, not a trusted link: a compromised page must not be
  // able to inject arbitrary URLs shown to users as job links.
  if (!sameHost(normalized, baseUrl)) return null;

  const title = firstString(posting.title, posting.name, posting.headline);
  const description =
    typeof posting.description === "string"
      ? htmlToTextOfEscaped(posting.description) || null
      : null;

  return {
    externalId: externalIdOf(posting),
    url: normalized,
    title: (title ?? normalized).slice(0, MAX_TITLE_LENGTH),
    location: locationOf(posting),
    description,
  };
};

/** JSON-LD JobPosting descriptions are already the full posting body. */
export const extractJobPostingDescription = (html: string): string | null => {
  for (const posting of extractJobPostings(html)) {
    if (typeof posting.description === "string") {
      const text = htmlToTextOfEscaped(posting.description);
      if (text) return text;
    }
  }
  return null;
};

export interface TAnchor {
  url: string;
  title: string;
}

/**
 * `anyPath` is the AI fallback's candidate set: every same-host link with its
 * anchor text, since a board without job-shaped paths still has titles to map.
 */
export const extractAnchors = (
  html: string,
  baseUrl: string,
  anyPath = false,
): TAnchor[] => {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const anchors: TAnchor[] = [];
  const seen = new Set<string>();

  const add = (href: string, node: INode): void => {
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return;
    }
    if (resolved.hostname.toLowerCase() !== base.hostname.toLowerCase()) {
      return;
    }
    // The listing page links to itself in the nav; it is never a posting.
    if (samePage(resolved.toString(), base.toString())) return;
    if (
      !anyPath &&
      !JOB_PATH_REGEX.test(resolved.pathname) &&
      !JOB_QUERY_REGEX.test(resolved.search)
    ) {
      return;
    }

    const url = normalizeJobUrl(resolved.toString());
    if (!url || url.length > MAX_URL_LENGTH || seen.has(url)) return;

    const title = normalizeWhitespace(textOf(node.children ?? [])).slice(
      0,
      MAX_TITLE_LENGTH,
    );
    seen.add(url);
    anchors.push({ url, title: title || url });
  };

  const visit = (node: INode, depth: number): void => {
    if (depth > MAX_DOM_DEPTH) return;
    if (node.name === "a") {
      const href = node.attribs?.href;
      if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
        add(href, node);
      }
    }
    for (const child of node.children ?? []) visit(child, depth + 1);
  };

  for (const node of parse(html).children ?? []) visit(node, 0);
  return anchors;
};

/**
 * Deterministic scrape: JSON-LD postings first, then job-shaped anchors on the
 * same host.
 */
export const scrapeListing = (
  html: string,
  baseUrl: string,
): TListingItem[] => {
  const items: TListingItem[] = [];
  const seen = new Set<string>();

  const add = (item: TListingItem) => {
    if (seen.has(item.url)) return;
    seen.add(item.url);
    items.push(item);
  };

  for (const posting of extractJobPostings(html)) {
    const item = postingToItem(posting, baseUrl);
    if (item) add(item);
  }

  for (const anchor of extractAnchors(html, baseUrl)) {
    add({
      externalId: null,
      url: anchor.url,
      title: anchor.title,
      location: null,
      description: null,
    });
  }

  return items;
};
