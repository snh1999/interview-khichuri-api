import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { asc, eq } from "drizzle-orm";

import { DATABASE_CONNECTION } from "@/src/database/database.constants";
import type { TApiKeyProvider } from "@/src/database/database.types";
import type { TdbPostgres } from "@/src/database/postgres/postgres.service";
import { user } from "@/src/database/postgres/schemas";
import { ApiKeyService } from "@/src/gen-ai/api-key/api-key.service";
import { GEN_AI_PROVIDERS } from "@/src/gen-ai/gen-ai.constants";

export interface ICrawlAiOwner {
  id: string;
  email: string;
}

export interface ICrawlAiCandidate {
  provider: TApiKeyProvider;
  keyId: string;
  updatedAt: number;
  model: string | null;
}

/**
 * Resolves who pays for crawler AI. The owner is the admin pinned by
 * `CRAWL_AI_OWNER_EMAIL` (case-insensitive), else the oldest admin. This is the
 * one place the crawler reaches the better-auth `user` table; it uses the same
 * Drizzle handle as `AdminService` because `user` is not in IDatabaseService.
 */
@Injectable()
export class CrawlAiOwnerService {
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly pg: TdbPostgres,
    private readonly apiKeys: ApiKeyService,
    private readonly config: ConfigService,
  ) {}

  public async resolveOwner(): Promise<ICrawlAiOwner | null> {
    const admins = await this.pg
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.role, "admin"))
      .orderBy(asc(user.createdAt));

    const pinned = this.config
      .get<string>("CRAWL_AI_OWNER_EMAIL")
      ?.trim()
      .toLowerCase();

    if (pinned) {
      const match = admins.find(
        (admin) => admin.email.toLowerCase() === pinned,
      );
      if (match) return match;
    }

    return admins[0] ?? null;
  }

  /** One active key per provider, in `GEN_AI_PROVIDERS` order (google first). */
  public async candidates(ownerId: string): Promise<ICrawlAiCandidate[]> {
    const rows = await this.apiKeys.findAll(undefined, true, ownerId);
    const byProvider = new Map(rows.map((row) => [row.provider, row]));

    return GEN_AI_PROVIDERS.flatMap((provider) => {
      const row = byProvider.get(provider);
      if (!row) return [];
      return [
        {
          provider,
          keyId: row.id,
          updatedAt: row.updatedAt.getTime(),
          model: row.model,
        },
      ];
    });
  }
}
