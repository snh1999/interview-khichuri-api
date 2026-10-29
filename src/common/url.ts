const TRACKING_PARAMS = new Set([
  "ref",
  "source",
  "gh_src",
  "lever-source",
  "lever-origin",
]);

/**
 * Normalizes a job posting URL for identity matching.
 * Returns undefined for anything that is not a plain http(s) URL.
 */
export function normalizeJobUrl(raw: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }

  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();

  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
}
