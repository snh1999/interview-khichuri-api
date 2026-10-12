import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";

import type { TSortEntry } from "@/src/config/guards/sort-by.decorator";
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
  TJobExtractionResult,
  TJobWithTopicIds,
  deadlineBeforeInterview,
} from "./jobs.dto";
import type { TDateFilter, TJobsQuery } from "./jobs.dto";
import type {
  TDatabase,
  TJob,
  TJobPreference,
  TJobWithTopics,
  TPagination,
  TSortBy,
  TDateRangeOption,
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

const MAX_JOBS_PER_USER = 200;

const JOB_TITLE_SEPARATOR = " - ";

const composeJobTitle = (
  companyName?: string | null,
  roleName?: string | null,
): string | undefined =>
  [companyName, roleName].filter(Boolean).join(JOB_TITLE_SEPARATOR) ||
  undefined;

const DATE_TYPE_COLUMN: Record<
  TDateFilter["type"],
  "deadline" | "interviewDate" | "appliedAt"
> = {
  deadline: "deadline",
  interview: "interviewDate",
  applied: "appliedAt",
};

@Injectable()
export class JobsService {
  public constructor(
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
    private readonly lookupsService: LookupsService,
    private readonly resumeService: ResumeService,
  ) {}

  public async create(dto: CreateJobDto, userId?: string): Promise<TJob> {
    if (userId) {
      const existing = await this.db.findAllByColumn("jobs", {
        filter: { userId },
      });
      if (existing.length >= MAX_JOBS_PER_USER) {
        throw new ConflictException(
          `You can only have up to ${MAX_JOBS_PER_USER} jobs`,
        );
      }
    }

    const { topicIds, ...data } = dto;

    return this.db.withTransaction(async (transaction) => {
      const job = await this.db.create(
        "jobs",
        { ...data, userId },
        transaction,
      );
      await this._createJobTopics(job.id, transaction, topicIds);
      return job;
    });
  }

  public async extractJob(
    dto: ExtractJobDto,
    userId?: string,
  ): Promise<TJobExtractionResult> {
    const extracted = await this.genAiService.extractJob(dto, userId);

    const roleId = await this.lookupsService.resolveOrCreateName(
      "roles",
      extracted.roleName,
    );

    return {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...extracted,
      title: composeJobTitle(extracted.companyName, extracted.roleName),
      roleId,
    };
  }

  public generateCoverLetter(
    id: string,
    dto: GenerateFromTemplateDto,
    userId?: string,
  ): Promise<{ markdown: string }> {
    return this._generateLetter(
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
    return this._generateLetter(
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
    return this._generateLetter(
      id,
      "linkedinDmTemplate",
      GENERATE_LINKEDIN_DM_PROMPT,
      LINKEDIN_DM_DEFAULT_SHAPE,
      dto,
      userId,
    );
  }

  // All three drafts differ only in prompt, template column and default shape,
  // so one builder serves them. A missing preference row or null template is
  // not an error: the draft still generates, just without the user's template.
  private async _generateLetter(
    id: string,
    templateColumn: TLetterTemplateColumn,
    prompt: string,
    defaultShape: string,
    dto: GenerateFromTemplateDto,
    userId?: string,
  ): Promise<{ markdown: string }> {
    const { provider, model, instruction } = dto;
    const profileId = userId ?? "app";

    const job = await this.db.findById("jobs", id, {
      filter: { ...(userId ? { userId } : {}) },
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
      `<job_description>\n${job.description}\n</job_description>`,
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

  public async findAll({
    userId,
    query,
    pagination,
    sort,
  }: {
    userId?: string;
    query?: TJobsQuery;
    pagination?: TPagination;
    sort?: TSortEntry[];
  }): Promise<TJob[]> {
    const { search, status, dateFilter: dateFilters } = query ?? {};

    const sortBy = [
      ...(sort?.length
        ? sort
        : [{ column: "isFavorite", order: "desc" as const }]),
      // trailing tiebreaker for stable pagination; a client-requested
      // `createdAt` sort stays first and wins, mirroring prep-session.findAll
      { column: "createdAt", order: "desc" as const },
    ] as TSortBy<"jobs">[];

    const dateRanges: TDateRangeOption<"jobs">[] = dateFilters
      ? dateFilters.map(({ type, from, to }) => ({
          column: DATE_TYPE_COLUMN[type],
          range: { from, to },
        }))
      : [];
    const filter = {
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
    };

    if (search) {
      // TODO: combined search + dateFilter breaks pagination, low priority for now as we are not using pagination in FE yet
      //  Fix: add an optional `search` option to findAllByColumn and fold FTS/LIKE into a single query with sortBy + dateRanges + pagination;
      const result = await this.db.search(
        "jobs",
        ["title", "description"],
        search,
        { filter, pagination },
      );

      if (dateRanges.length === 0) {
        return result.data;
      }

      const allJobs = await this.db.findAllByColumn("jobs", {
        filter,
        sortBy,
        dateRanges,
      });

      const searchIds = new Set(result.data.map((j: TJob) => j.id));
      return allJobs.filter((j: TJob) => searchIds.has(j.id));
    }

    return this.db.findAllByColumn("jobs", {
      filter,
      sortBy,
      pagination,
      ...(dateRanges.length > 0 && { dateRanges }),
    });
  }

  public async findOne(
    id: string,
    userId?: string,
    populate = true,
  ): Promise<TJobWithTopicIds> {
    const job = (await this.db.findById("jobs", id, {
      filter: { ...(userId ? { userId } : {}) },
      relation: populate ? { jobTopics: true } : undefined,
    })) as TJobWithTopics;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const topicIds = (job.jobTopics ?? []).map((jt) => jt.topicId);

    return {
      ...job,
      topicIds,
    };
  }

  public async update(
    id: string,
    dto: UpdateJobDto,
    userId?: string,
  ): Promise<TJob> {
    const { topicIds, ...data } = dto;

    const existing = await this.findOne(id, userId);

    if (
      !deadlineBeforeInterview({
        deadline: data.deadline ?? existing.deadline,
        interviewDate: data.interviewDate ?? existing.interviewDate,
      })
    ) {
      throw new BadRequestException(
        "Deadline must be before the interview date",
      );
    }

    await this.db.withTransaction(async (transaction) => {
      if (Object.keys(data).length > 0) {
        await this.db.update(
          "jobs",
          data,
          userId ? { id, userId } : { id },
          transaction,
        );
      }
      await this._createJobTopics(id, transaction, topicIds);
    });

    return this.findOne(id, userId);
  }

  public async delete(id: string, userId?: string): Promise<void> {
    return this.db.delete("jobs", {
      id,
      ...(userId ? { userId } : {}),
    });
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
