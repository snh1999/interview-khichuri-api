import { Logger } from "@nestjs/common";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

/* eslint-disable sonarjs/no-clear-text-protocols */
const LOCAL_ALLOWED_URLS_WILDCARDS = [
  "http://localhost:*",
  "http://127.0.0.1:*",
];

const ALLOWED_HEADERS = [
  "host",
  "user-agent",
  "accept",
  "accept-language",
  "accept-encoding",
  "content-type",
  "authorization",
  "content-length",
  "origin",
  "connection",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "pragma",
  "cache-control",
  "access-control-request-headers",
  "access-control-request-method",
];

const ALLOWED_METHODS = [
  "GET",
  "HEAD",
  "PUT",
  "POST",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

export const getAllowedOriginWildcards = (): string[] => {
  const envStage = process.env.NODE_ENV;
  const siteUrl = process.env.FRONTEND_URL;

  const baseUrls = siteUrl ? [siteUrl] : [];

  if (envStage === "local" || envStage === "development") {
    return [...LOCAL_ALLOWED_URLS_WILDCARDS, ...baseUrls];
  }
  return baseUrls;
};

export const getAllowedHeaders = (): string[] => ALLOWED_HEADERS;

export const getAllowedMethods = (): string => ALLOWED_METHODS.join(",");

export const getAllowedOrigins = (): ((
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => void) => {
  const envStage = process.env.NODE_ENV;
  const isDev = envStage === "local" || envStage === "development";
  const allowedOriginWildcards = getAllowedOriginWildcards();

  return (origin, callback) => {
    if (!origin && isDev) {
      callback(null, true);
      return;
    }

    if (!origin) {
      callback(null, false);
      return;
    }

    for (const allowedOriginWildcard of allowedOriginWildcards) {
      const escaped = allowedOriginWildcard
        .replaceAll(/[.+^${}()|[\]\\]/gu, String.raw`\$&`)
        .replaceAll("*", ".*");
      const regexPattern = new RegExp(`^${escaped}$`, "u");

      if (regexPattern.test(origin)) {
        callback(null, true);
        return;
      }
    }
    const logger = new Logger("CORS");
    logger.warn(`CORS blocked origin: ${origin}`);

    callback(null, false);
  };
};
export const getCorsConfig = (): CorsOptions => ({
  origin: getAllowedOrigins(),
  methods: ALLOWED_METHODS,
  allowedHeaders: getAllowedHeaders(),
  credentials: true,
});
