import type { Logger } from "@nestjs/common";

import type { TApiKeyProvider } from "@/src/database/database.types";
import { toAiOutputException } from "@/src/gen-ai/ai-output-error";
import {
  describeProviderError,
  toAiHttpException,
  toAiTimeoutException,
  toQuotaExceededHttpException,
} from "@/src/gen-ai/gen-ai.errors";

interface IAiCallContext {
  provider: TApiKeyProvider;
  model?: string | null;
  operation?: string;
  logger: Logger;
}

interface IAiCallArgs {
  provider: TApiKeyProvider;
  model?: string | null;
  operation?: string;
}

export const mapAiError = (
  err: unknown,
  { provider, model, operation = "this request", logger }: IAiCallContext,
): unknown => {
  const details = describeProviderError(err);

  const quota = toQuotaExceededHttpException(err, provider, model);
  if (quota) {
    logger.warn("AI provider quota or rate limit exceeded", {
      provider,
      model,
      ...details,
    });
    return quota;
  }

  const mapped =
    toAiTimeoutException(err) ?? toAiOutputException(err, operation, logger);
  if (mapped) {
    return mapped;
  }

  const http = toAiHttpException(err, provider, model);
  if (http) {
    logger.warn("AI provider request failed", { provider, model, ...details });
    return http;
  }

  logger.error("AI request failed", {
    operation,
    errorName: err instanceof Error ? err.name : typeof err,
  });
  return err;
};

export function MapAiErrors() {
  return (
    _target: object,
    _key: string | symbol,
    descriptor: PropertyDescriptor,
  ): void => {
    const original = descriptor.value as (
      ...args: unknown[]
    ) => Promise<unknown>;

    descriptor.value = async function (
      this: { logger: Logger },
      ...args: unknown[]
    ) {
      try {
        return (await original.apply(this, args)) as unknown;
      } catch (err) {
        throw mapAiError(err, {
          ...(args[0] as IAiCallArgs),
          logger: this.logger,
        });
      }
    };
  };
}
