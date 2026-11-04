import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import type { ICrawlAiStatus } from "@/src/crawl/crawl.ai";
import { CrawlAiService } from "@/src/crawl/crawl.ai";
import { cleanText } from "@/src/crawl/crawl.constants";
import { DATABASE_CONNECTION } from "@/src/database/database.constants";
import { IDatabaseService } from "@/src/database/database.service";
import type {
  TColumnFilter,
  TJob,
  TPagination,
  TSortBy,
} from "@/src/database/database.types";
import type { TdbPostgres } from "@/src/database/postgres/postgres.service";
import {
  account,
  api_key,
  calendar_events,
  interviews,
  jobs,
  notes,
  passkey,
  prep_session,
  profiles,
  prompts,
  resume,
  session,
  user,
} from "@/src/database/postgres/schemas";

import type {
  SetJobDescriptionDto,
  TAdminJobsQuery,
  TAdminUsersQuery,
} from "./admin.dto";
import type {
  IAdminJobsResponse,
  IAdminStats,
  IAdminUser,
  IAdminUserDetail,
  IAdminUsersResponse,
} from "./admin.types";

const DAY_MS = 86_400_000;
const SIGNUP_WINDOW_DAYS = 30;
const DEFAULT_PAGE_LIMIT = 20;

const USER_FIELDS = {
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  image: user.image,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
};

const USER_SORT_COLUMNS = {
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
} as const;

interface TAdminUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminService {
  public constructor(
    @Inject(IDatabaseService) private readonly db: IDatabaseService,
    @Inject(DATABASE_CONNECTION) private readonly pg: TdbPostgres,
    private readonly crawlAiService: CrawlAiService,
  ) {}

  public async getStats(): Promise<IAdminStats> {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const since30d = new Date(now.getTime() - SIGNUP_WINDOW_DAYS * DAY_MS);

    const [
      total,
      verified,
      banned,
      new7d,
      new30d,
      activeSessions,
      jobCount,
      prepCount,
      interviewCount,
      resumeCount,
      noteCount,
      promptCount,
      apiKeyCount,
      companyCount,
      calendarCount,
      signupRows,
    ] = await Promise.all([
      this.pg.$count(user),
      this.pg.$count(user, eq(user.emailVerified, true)),
      this.pg.$count(user, eq(user.banned, true)),
      this.pg.$count(user, gte(user.createdAt, since7d)),
      this.pg.$count(user, gte(user.createdAt, since30d)),
      this.pg.$count(session, gt(session.expiresAt, now)),
      this.db.count("jobs"),
      this.db.count("prep_session"),
      this.db.count("interviews"),
      this.db.count("resume"),
      this.db.count("notes"),
      this.db.count("prompts"),
      this.db.count("api_key"),
      this.db.count("companies"),
      this.db.count("calendar_events"),
      this.pg
        .select({ createdAt: user.createdAt })
        .from(user)
        .where(gte(user.createdAt, startOfSignupWindow(now))),
    ]);

    return {
      users: { total, verified, banned, new7d, new30d, activeSessions },
      usage: {
        jobs: jobCount,
        prepSessions: prepCount,
        interviews: interviewCount,
        resumes: resumeCount,
        notes: noteCount,
        prompts: promptCount,
        apiKeys: apiKeyCount,
        companies: companyCount,
        calendarEvents: calendarCount,
      },
      signups: bucketSignups(signupRows, now),
    };
  }

  public async findUsers(
    query: TAdminUsersQuery,
    pagination?: TPagination,
    sort?: TSortEntry[],
  ): Promise<IAdminUsersResponse> {
    const conditions = buildUserConditions(query);
    const where = conditions.length ? and(...conditions) : undefined;
    const orderBy = sort?.length
      ? sort.map(orderUserColumn)
      : [desc(user.createdAt)];

    const [rows, total] = await Promise.all([
      this.pg
        .select(USER_FIELDS)
        .from(user)
        .where(where)
        .orderBy(...orderBy)
        .limit(pagination?.limit ?? DEFAULT_PAGE_LIMIT)
        .offset(pagination?.offset ?? 0),
      this.pg.$count(user, where),
    ]);

    return { users: rows.map(toAdminUser), total };
  }

  public async findUser(id: string): Promise<IAdminUserDetail> {
    const rows = await this.pg
      .select(USER_FIELDS)
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException(`User ${id} not found`);
    }
    const userRow = rows[0];

    const [
      profileRow,
      jobCount,
      prepCount,
      interviewCount,
      resumeCount,
      noteCount,
      promptCount,
      apiKeyCount,
      calendarCount,
      providerRows,
      passkeyCount,
    ] = await Promise.all([
      this.pg
        .select({
          firstName: profiles.firstName,
          lastName: profiles.lastName,
          location: profiles.location,
          country: profiles.country,
        })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1),
      this.pg.$count(jobs, eq(jobs.userId, id)),
      this.pg.$count(prep_session, eq(prep_session.userId, id)),
      this.pg.$count(interviews, eq(interviews.userId, id)),
      this.pg.$count(resume, eq(resume.profileId, id)),
      this.pg.$count(notes, eq(notes.userId, id)),
      this.pg.$count(prompts, eq(prompts.userId, id)),
      this.pg.$count(api_key, eq(api_key.userId, id)),
      this.pg.$count(calendar_events, eq(calendar_events.userId, id)),
      this.pg
        .selectDistinct({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, id)),
      this.pg.$count(passkey, eq(passkey.userId, id)),
    ]);

    return {
      user: toAdminUser(userRow),
      profile: profileRow[0] ?? null,
      counts: {
        jobs: jobCount,
        prepSessions: prepCount,
        interviews: interviewCount,
        resumes: resumeCount,
        notes: noteCount,
        prompts: promptCount,
        apiKeys: apiKeyCount,
        calendarEvents: calendarCount,
      },
      providers: providerRows.map((row) => row.providerId),
      passkeys: passkeyCount,
    };
  }

  public async findFailedJobs(): Promise<TJob[]> {
    return this.db.findAllByColumn("jobs", {
      filter: { userId: null, state: "failed" },
      sortBy: [{ column: "stateChangedAt", order: "desc" }],
    });
  }

  public async findSystemJobs(
    query: TAdminJobsQuery,
    pagination?: TPagination,
    sort?: TSortEntry[],
  ): Promise<IAdminJobsResponse> {
    const filter: TColumnFilter<"jobs"> = { userId: null };
    if (query.state) filter.state = query.state;
    if (query.provider) filter.provider = query.provider;
    if (query.companyId !== undefined) filter.companyId = query.companyId;

    const page = pagination ?? {
      limit: DEFAULT_PAGE_LIMIT,
      offset: 0,
    };

    if (query.q) {
      const result = await this.db.search(
        "jobs",
        ["title", "companyName"],
        query.q,
        { filter, pagination: page },
      );
      return { items: result.data, total: result.total };
    }

    const sortBy = (
      sort?.length ? sort : [{ column: "createdAt", order: "desc" }]
    ) as TSortBy<"jobs">[];
    const [items, total] = await Promise.all([
      this.db.findAllByColumn("jobs", { filter, pagination: page, sortBy }),
      this.db.count("jobs", filter),
    ]);
    return { items, total };
  }

  public async retryFailedJob(id: string): Promise<TJob> {
    await this._findSystemJob(id);
    const [job] = await this.db.update(
      "jobs",
      { state: "none", stateChangedAt: new Date() },
      { id, userId: null },
    );
    return job;
  }

  public async retryFailedJobs(): Promise<{ count: number }> {
    const jobs = await this.db.update(
      "jobs",
      { state: "none", stateChangedAt: new Date() },
      { userId: null, state: "failed" },
      undefined,
      true,
    );
    return { count: jobs.length };
  }

  public async setJobDescription(
    id: string,
    dto: SetJobDescriptionDto,
  ): Promise<TJob> {
    await this._findSystemJob(id);
    const [job] = await this.db.update(
      "jobs",
      {
        description: cleanText(dto.description),
        state: "ok",
        stateChangedAt: new Date(),
      },
      { id, userId: null },
    );
    return job;
  }

  public getAiStatus(): Promise<ICrawlAiStatus> {
    return this.crawlAiService.status();
  }

  private async _findSystemJob(id: string): Promise<TJob> {
    const job = await this.db.findById("jobs", id);
    if (job.userId !== null) {
      throw new NotFoundException("Job not found");
    }
    return job;
  }
}

function buildUserConditions(query: TAdminUsersQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.q) {
    const pattern = `%${query.q}%`;
    const search = or(ilike(user.name, pattern), ilike(user.email, pattern));
    if (search) conditions.push(search);
  }
  if (query.role) {
    conditions.push(eq(user.role, query.role));
  }
  if (query.banned !== undefined) {
    conditions.push(
      query.banned ? eq(user.banned, true) : sql`${user.banned} IS NOT TRUE`,
    );
  }
  if (query.verified !== undefined) {
    conditions.push(eq(user.emailVerified, query.verified));
  }

  return conditions;
}

function orderUserColumn(entry: TSortEntry): SQL {
  const key = entry.column as keyof typeof USER_SORT_COLUMNS;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const column = USER_SORT_COLUMNS[key] ?? user.createdAt;
  return entry.order === "desc" ? desc(column) : asc(column);
}

function toAdminUser(row: TAdminUserRow): IAdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    role: row.role,
    banned: row.banned,
    banReason: row.banReason,
    banExpires: row.banExpires ? row.banExpires.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function startOfSignupWindow(now: Date): Date {
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(todayUtc - (SIGNUP_WINDOW_DAYS - 1) * DAY_MS);
}

function bucketSignups(
  rows: { createdAt: Date }[],
  now: Date,
): { date: string; count: number }[] {
  // ponytail: JS bucketing; move to SQL date_trunc aggregation if user volume grows.
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const buckets = new Map<string, number>();
  for (let i = SIGNUP_WINDOW_DAYS - 1; i >= 0; i--) {
    buckets.set(toDayKey(new Date(todayUtc - i * DAY_MS)), 0);
  }
  for (const row of rows) {
    const key = toDayKey(row.createdAt);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }
  return [...buckets].map(([date, count]) => ({ date, count }));
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
