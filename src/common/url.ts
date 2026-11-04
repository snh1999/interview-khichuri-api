const TRACKING_PARAMS = new Set([
  "ref",
  "source",
  "gh_src",
  "lever-source",
  "lever-origin",
]);

/**
 * Validates and normalizes any URL the app stores and later renders.
 * Only absolute HTTPS URLs are accepted; relative, credential-bearing and non-HTTPS URLs are rejected.
 */
export function normalizeToHttpsUrl(raw: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return undefined;
  }
  return parsed.toString();
}

/**
 * Normalizes a job posting URL for identity matching.
 * Returns undefined for anything that is not a plain HTTP(S) URL.
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
