import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { normalizeJobUrl } from "@/src/common/url";
import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
import { LOCAL_USER_ID } from "@/src/database/database.constants";
import { IDatabaseService } from "@/src/database/database.service";
import {
  COVER_LETTER_DEFAULT_SHAPE,
  GENERATE_COVER_LETTER_PROMPT,
  GENERATE_LINKEDIN_DM_PROMPT,
  GENERATE_OUTREACH_EMAIL_PROMPT,
  LINKEDIN_DM_DEFAULT_SHAPE,
  OUTREACH_EMAIL_DEFAULT_SHAPE,
  TEMPLATE_MODE_RULES,
} from "@/src/gen-ai/gen-ai.constants";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";
import { markdownSchema } from "@/src/notes/notes.dto";
import { ResumeService } from "@/src/resume/resume.service";

import {
  CreateJobDto,
  GenerateFromTemplateDto,
  UpdateJobDto,
  ExtractJobDto,
  UpdateTrackedJobDto,
  TJobExtractionResult,
  TJobPopulated,
  deadlineBeforeInterview,
} from "./jobs.dto";
import type { TJobsQuery, TTrackedJobFields } from "./jobs.dto";
import type {
  TColumnFilter,
  TDatabase,
  TJob,
  TJobPreference,
  TJobWithTopics,
  TPagination,
  TSortBy,
  TTrackedJob,
  TTrackedJobWithJob,
} from "../database/database.types";

type TLetterTemplateColumn =
  "coverLetterTemplate" | "outreachEmailTemplate" | "linkedinDmTemplate";

const TEMPLATE_TAGS: Record<TLetterTemplateColumn, string> = {
  coverLetterTemplate: "cover_letter",
  outreachEmailTemplate: "email",
  linkedinDmTemplate: "linkedin_dm",
};

type TJobPreferenceWithTitles = TJobPreference & {
  titles?: ({ role?: { name?: string | null } | null } | undefined)[];
};

type TUserJob = TJob & { track: TTrackedJob };

const MAX_TRACKED_JOBS = 200;

const JOB_TITLE_SEPARATOR = " - ";

const JOB_DISCOVERY_FILTER: TColumnFilter<"jobs"> = {
  state: "ok",
  userId: null,
  closedAt: null,
};

const composeJobTitle = (
  companyName?: string | null,
  roleName?: string | null,
): string | undefined =>
  [companyName, roleName].filter(Boolean).join(JOB_TITLE_SEPARATOR) ||
  undefined;

@Injectable()
export class JobsService {
  public constructor(
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
    private readonly lookupsService: LookupsService,
    private readonly resumeService: ResumeService,
  ) {}

  /** Private job creation: the job and its first track are owned by the actor. */
  public async create(
    dto: CreateJobDto,
    userId: string = LOCAL_USER_ID,
  ): Promise<TJobPopulated> {
    await this._assertTrackedJobCapacity(userId);
    const {
      topicIds,
      status,
      isFavorite,
      notes,
      appliedAt,
      interviewDate,
      ...jobData
    } = dto;

    const job = await this.db.withTransaction(async (transaction) => {
      const created = await this.db.create(
        "jobs",
        {
          ...jobData,
          provider: "manual",
          state: "ok",
          stateChangedAt: new Date(),
          userId,
        },
        transaction,
      );
      await this.db.create(
        "tracked_jobs",
        {
          userId,
          jobId: created.id,
          ...this._trackedJobFields({
            status,
            isFavorite,
            notes,
            appliedAt,
            interviewDate,
          }),
        },
        transaction,
      );
      await this._createJobTopics(created.id, transaction, topicIds);
      return created;
    });

    return this.findOne(job.id, userId);
  }

  public async extractJob(
    dto: ExtractJobDto,
    userId?: string,
  ): Promise<TJobExtractionResult> {
    const extracted = await this.genAiService.extractJob(dto, userId);
    const url = extracted.url ? normalizeJobUrl(extracted.url) : undefined;

    const roleId = await this.lookupsService.resolveOrCreateName(
      "roles",
      extracted.roleName,
    );

    return {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...extracted,
      url,
      title: composeJobTitle(extracted.companyName, extracted.roleName),
      roleId,
    };
  }

  /** Paste-match lookup: open system jobs whose normalized URL matches. */
  public async findFromUrl(url: string): Promise<TJob[]> {
    const normalized = normalizeJobUrl(url);
    if (!normalized) {
      throw new BadRequestException("Invalid job URL");
    }

    return this.db.findAllByColumn("jobs", {
      filter: {
        ...JOB_DISCOVERY_FILTER,
        url: normalized,
      },
    });
  }

  public generateCoverLetter(
    id: string,
    dto: GenerateFromTemplateDto,
    userId?: string,
  ): Promise<{ markdown: string }> {
    return this._generate(
      id,
      "coverLetterTemplate",
      GENERATE_COVER_LETTER_PROMPT,
      COVER_LETTER_DEFAULT_SHAPE,
      dto,
      userId,
    );
  }

  public generateOutreachEmail(
    id: string,
    dto: GenerateFromTemplateDto,
    userId?: string,
  ): Promise<{ markdown: string }> {
    return this._generate(
      id,
      "outreachEmailTemplate",
      GENERATE_OUTREACH_EMAIL_PROMPT,
      OUTREACH_EMAIL_DEFAULT_SHAPE,
      dto,
      userId,
    );
  }

  public generateLinkedInDm(
    id: string,
    dto: GenerateFromTemplateDto,
    userId?: string,
  ): Promise<{ markdown: string }> {
    return this._generate(
      id,
      "linkedinDmTemplate",
      GENERATE_LINKEDIN_DM_PROMPT,
      LINKEDIN_DM_DEFAULT_SHAPE,
      dto,
      userId,
    );
  }

  private async _generate(
    id: string,
    templateColumn: TLetterTemplateColumn,
    prompt: string,
    defaultShape: string,
    dto: GenerateFromTemplateDto,
    userId?: string,
  ): Promise<{ markdown: string }> {
    const { provider, model, instruction } = dto;
    const profileId = userId ?? "";

    const job = await this.db.findById("jobs", id, {
      filter: { ...(userId ? { userId: [null, userId] } : {}) },
    });

    const [preferences] = (await this.db.findAllByColumn("job_preference", {
      filter: { profileId },
      relation: { titles: { with: { role: true } } },
    })) as unknown as (TJobPreferenceWithTitles | undefined)[];

    const resume = await this.resumeService.resumeToText({
      userId: profileId,
      provider,
      model,
      ...(dto.resumeId ? { resumeId: dto.resumeId } : {}),
    });

    const template = preferences?.[templateColumn]?.trim();
    const templateTag = TEMPLATE_TAGS[templateColumn];

    const contextParts = [
      template
        ? `<template_${templateTag}>\n${template}\n</template_${templateTag}>`
        : "",
      `<job_title>\n${job.title}\n</job_title>`,
      `<company_name>\n${job.companyName}\n</company_name>`,
      `<job_description>\n${job.description ?? ""}\n</job_description>`,
      this._formatPreferences(preferences),
      `<candidate_resume>\n${resume}\n</candidate_resume>`,
    ].filter(Boolean);

    const modeRules = template ? TEMPLATE_MODE_RULES : defaultShape;

    return this.genAiService.generateStructured({
      prompt: `${prompt}\n\n${modeRules}\n\n${contextParts.join("\n\n")}${
        template
          ? `\n\nReminder: follow <template_${templateTag}> closely.`
          : ""
      }`,
      schema: markdownSchema,
      provider,
      model,
      instruction,
      userId,
    });
  }

  private _formatPreferences(preferences?: TJobPreferenceWithTitles): string {
    if (!preferences) return "";

    const titles = (preferences.titles ?? [])
      .map((title) => title?.role?.name)
      .filter((name): name is string => Boolean(name));
    const salary =
      preferences.salaryLower || preferences.salaryExpected
        ? `${preferences.salaryLower ?? "?"} - ${preferences.salaryExpected ?? "?"} ${preferences.currency ?? ""}`.trim()
        : "";

    const lines = [
      preferences.workType ? `Work type: ${preferences.workType}` : "",
      preferences.preferredLocation
        ? `Preferred location: ${preferences.preferredLocation}`
        : "",
      titles.length > 0 ? `Target titles: ${titles.join(", ")}` : "",
      salary ? `Salary expectation: ${salary}` : "",
    ].filter(Boolean);

    return lines.length > 0
      ? `<candidate_preferences>\n${lines.join("\n")}\n</candidate_preferences>`
      : "";
  }

  /** My jobs: at most MAX_TRACKED_JOBS rows, filtered/sorted/paged in memory. */
  public async findAll({
    userId = LOCAL_USER_ID,
    query,
    pagination,
    sort,
  }: {
    userId?: string;
    query?: TJobsQuery;
    pagination?: TPagination;
    sort?: TSortEntry[];
  }): Promise<TJobPopulated[]> {
    const rows = (await this.db.findAllByColumn("tracked_jobs", {
      filter: { userId },
      relation: { job: true },
    })) as unknown as TTrackedJobWithJob[];

    const items: TUserJob[] = rows.flatMap(({ job, ...trackedJob }) =>
      job ? [{ ...job, track: trackedJob }] : [],
    );

    return this._filterSortPage(items, query, pagination, sort);
  }

  public async discover({
    query,
    pagination,
    sort,
    companyId,
  }: {
    query?: TJobsQuery;
    pagination?: TPagination;
    sort?: TSortEntry[];
    companyId?: number;
  }): Promise<TJob[]> {
    // App mode has no crawler and no system jobs; discovery stays empty until app clients get a real identity (magic-link auth).
    if (process.env.IS_APP_MODE) {
      return [];
    }

    const { search } = query ?? {};
    const filter: TColumnFilter<"jobs"> = companyId
      ? { ...JOB_DISCOVERY_FILTER, companyId }
      : JOB_DISCOVERY_FILTER;

    const sortBy = (
      sort?.length ? sort : [{ column: "createdAt", order: "desc" as const }]
    ) as TSortBy<"jobs">[];

    if (search) {
      const result = await this.db.search(
        "jobs",
        ["title", "description"],
        search,
        { filter, pagination },
      );
      return result.data;
    }

    return this.db.findAllByColumn("jobs", {
      filter,
      sortBy,
      pagination,
    });
  }

  public async findOne(
    id: string,
    userId: string = LOCAL_USER_ID,
    populate = true,
  ): Promise<TJobPopulated> {
    const job = (await this.db.findById("jobs", id, {
      relation: populate ? { jobTopics: true } : undefined,
    })) as TJobWithTopics;

    const trackedJobs = await this.db.findAllByColumn("tracked_jobs", {
      filter: { userId, jobId: id },
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const topicIds = (job.jobTopics ?? []).map((jt) => jt.topicId);

    if (job.userId && job.userId !== userId) {
      throw new NotFoundException("Job not found");
    }

    const { jobTopics: _jobTopics, ...rest } = job;

    return {
      ...rest,
      topicIds,
      track: trackedJobs.length === 1 ? trackedJobs[0] : null,
    };
  }

  public async trackJob(
    jobId: string,
    userId: string = LOCAL_USER_ID,
  ): Promise<TJobPopulated> {
    const job = await this.findOne(jobId, userId);

    if (job.track) {
      return job;
    }

    if (job.userId) {
      throw new BadRequestException("Only system jobs can be tracked");
    }
    if (job.state !== "ok" || job.closedAt) {
      throw new BadRequestException("This job is closed");
    }

    await this._assertTrackedJobCapacity(userId);
    await this.db.create("tracked_jobs", { userId, jobId });
    return this.findOne(jobId, userId);
  }

  public async updateTrackedJob(
    jobId: string,
    dto: UpdateTrackedJobDto,
    userId: string = LOCAL_USER_ID,
  ): Promise<TJobPopulated> {
    const job = await this.findOne(jobId, userId);
    const trackedJob = job.track;
    if (!trackedJob) {
      throw new NotFoundException("Tracked job not found");
    }

    if (
      !deadlineBeforeInterview({
        deadline: job.deadline,
        interviewDate: dto.interviewDate ?? trackedJob.interviewDate,
      })
    ) {
      throw new BadRequestException(
        "Deadline must be before the interview date",
      );
    }

    const data = this._trackedJobFields(dto);
    if (Object.keys(data).length > 0) {
      await this.db.update("tracked_jobs", data, {
        id: trackedJob.id,
        userId,
      });
    }

    return this.findOne(jobId, userId);
  }

  /** Removes the job from the caller's list; private jobs are deleted with it. */
  public async delete(
    id: string,
    userId: string = LOCAL_USER_ID,
    force = false,
  ): Promise<void> {
    const job = await this.findOne(id, userId);
    const trackedJob = job.track;

    if (!trackedJob && !job.userId) {
      throw new NotFoundException("Tracked job not found");
    }

    if (trackedJob) {
      const sessions = await this.db.findAllByColumn("prep_session", {
        filter: { jobId: job.id },
      });
      if (sessions.length > 0 && !force) {
        throw new ConflictException({
          code: "TRACKED_JOB_HAS_PREP_SESSIONS",
          hasPrepSessions: true,
          count: sessions.length,
        });
      }
    }

    await this.db.withTransaction(async (transaction) => {
      if (trackedJob) {
        await this.db.delete(
          "tracked_jobs",
          { id: trackedJob.id, userId },
          false,
          transaction,
        );
      }
      if (job.userId) {
        await this.db.delete(
          "jobs",
          { id: job.id, userId },
          false,
          transaction,
        );
      }
    });
  }

  public async update(
    id: string,
    dto: UpdateJobDto,
    userId: string = LOCAL_USER_ID,
  ): Promise<TJobPopulated> {
    const existing = await this.findOne(id, userId);

    if (!existing.userId) {
      throw new BadRequestException("System jobs are read-only");
    }

    const { topicIds, ...data } = dto;

    if (
      !deadlineBeforeInterview({
        deadline: data.deadline ?? existing.deadline,
        interviewDate: existing.track?.interviewDate,
      })
    ) {
      throw new BadRequestException(
        "Deadline must be before the interview date",
      );
    }

    await this.db.withTransaction(async (transaction) => {
      if (Object.keys(data).length > 0) {
        await this.db.update("jobs", data, { id, userId }, transaction);
      }
      await this._createJobTopics(id, transaction, topicIds);
    });

    return this.findOne(id, userId);
  }

  private async _assertTrackedJobCapacity(userId: string): Promise<void> {
    const count = await this.db.count("tracked_jobs", { userId });
    if (count >= MAX_TRACKED_JOBS) {
      throw new ConflictException(
        `You can only track up to ${MAX_TRACKED_JOBS} jobs`,
      );
    }
  }

  private _trackedJobFields(
    dto: TTrackedJobFields,
  ): Partial<TTrackedJobFields> {
    const { status, isFavorite, notes, appliedAt, interviewDate } = dto;
    return {
      ...(status !== undefined && { status }),
      ...(isFavorite !== undefined && { isFavorite }),
      ...(notes !== undefined && { notes }),
      ...(appliedAt !== undefined && { appliedAt }),
      ...(interviewDate !== undefined && { interviewDate }),
    };
  }

  private _filterSortPage(
    items: TUserJob[],
    query?: TJobsQuery,
    pagination?: TPagination,
    sort?: TSortEntry[],
  ): TUserJob[] {
    const { search } = query ?? {};
    let result = items;

    if (search) {
      const needle = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(needle) ||
          (item.description?.toLowerCase().includes(needle) ?? false),
      );
    }

    const sortEntries: TSortEntry[] = sort?.length
      ? sort
      : [
          { column: "isFavorite", order: "desc" },
          { column: "createdAt", order: "desc" },
        ];

    result = [...result].sort((a, b) => {
      for (const { column, order = "asc" } of sortEntries) {
        const av = this._sortValue(a, column);
        const bv = this._sortValue(b, column);
        const aMissing = av === null || av === undefined;
        const bMissing = bv === null || bv === undefined;
        // missing values sort last in both directions, so "appliedAt:desc" leads with real applications instead of nulls
        if (aMissing || bMissing) {
          if (aMissing && bMissing) continue;
          return aMissing ? 1 : -1;
        }
        const comparison = this._compare(av, bv);
        if (comparison !== 0) {
          return order === "desc" ? -comparison : comparison;
        }
      }
      return 0;
    });

    if (pagination) {
      result = result.slice(
        pagination.offset,
        pagination.offset + pagination.limit,
      );
    }

    return result;
  }

  private _sortValue(item: TUserJob, column: string): unknown {
    if (column in item) {
      return (item as unknown as Record<string, unknown>)[column];
    }
    return (item.track as unknown as Record<string, unknown>)[column];
  }

  private _compare(a: unknown, b: unknown): number {
    if (a === null || a === undefined) {
      return b === null || b === undefined ? 0 : 1;
    }
    if (b === null || b === undefined) return -1;
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "boolean" && typeof b === "boolean") {
      return Number(a) - Number(b);
    }
    if (typeof a === "string" && typeof b === "string") {
      return a.localeCompare(b);
    }
    return 0;
  }

  private async _createJobTopics(
    jobId: string,
    transaction: TDatabase,
    topicIds?: number[],
  ) {
    if (!topicIds) return;

    await this.db.syncJunctionTable(
      "job_topics",
      { column: "jobId", value: jobId },
      "topicId",
      topicIds,
      transaction,
    );
  }
}
