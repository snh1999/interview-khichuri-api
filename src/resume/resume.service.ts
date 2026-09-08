import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { extractText } from "unpdf";

import { IDatabaseService } from "@/src/database/database.service";
import type {
  TApiKeyProvider,
  TJobWithCompany,
  TResume,
} from "@/src/database/database.types";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";
import {
  CreateResumeDto,
  ExtractionResult,
  ReviewStandaloneDto,
  ScoreResumeDto,
  TAtsScore,
  TStandaloneReview,
  type TResumeContent,
  UpdateResumeDto,
} from "@/src/resume/resume.dto";
import {
  FileUploadService,
  TUploadResponse,
  TViewUrlResponse,
} from "@/src/utilities/upload/file-upload.service";

const MAX_RESUMES = 5;

export type TResumeResponse = Omit<TResume, "content"> & {
  content: TResumeContent | null;
};

function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

const omitKeys = <T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    private readonly fileService: FileUploadService,
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
    private readonly lookupsService: LookupsService,
  ) {}

  public async findAll(profileId: string): Promise<TResumeResponse[]> {
    const resumes = await this.db.findAllByColumn("resume", {
      filter: { profileId },
    });
    return resumes.map((resume) => this._mapResume(resume));
  }

  public async findById(
    resumeId: string,
    profileId: string,
  ): Promise<TResumeResponse> {
    const resume = await this._findById(resumeId, profileId);
    return this._mapResume(resume);
  }

  public async findBySlug(slug: string): Promise<TResumeResponse> {
    const results = await this.db.findAllByColumn("resume", {
      filter: { slug, isPublic: true },
    });

    if (results.length === 0) {
      throw new NotFoundException("Resume not found or not public");
    }

    return this._mapResume(results[0]);
  }

  public async create(
    profileId: string,
    data: CreateResumeDto,
  ): Promise<TResumeResponse> {
    const existingCount = await this._checkQuota(profileId);
    return this._mapResume(
      await this.db.create("resume", {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...data,
        profileId,
        content: JSON.stringify(data.content),
        isPrimary: existingCount === 0,
      }),
    );
  }

  public async update(
    resumeId: string,
    profileId: string,
    data: UpdateResumeDto,
  ): Promise<TResumeResponse> {
    const resume = await this._findById(resumeId, profileId);

    if (data.content && resume.url) {
      throw new BadRequestException(
        "This resume is a PDF upload and cannot be edited as content",
      );
    }

    const slug =
      data.isPublic === true && !resume.slug
        ? generateSlug(data.name ?? resume.name)
        : resume.slug;

    const [updated] = await this.db.update(
      "resume",
      {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...data,
        slug,
        content: data.content ? JSON.stringify(data.content) : undefined,
      },
      { id: resumeId },
    );

    return this._mapResume(updated);
  }

  public async upload(
    file: Express.Multer.File,
    profileId: string,
    name?: string,
  ): Promise<TUploadResponse> {
    const existingCount = await this._checkQuota(profileId);

    const { filename } = await this.fileService.uploadFile(
      file,
      profileId,
      "resumes",
    );

    try {
      await this.db.create("resume", {
        profileId,
        name: name?.trim() ?? file.originalname,
        url: filename,
        isPrimary: existingCount === 0,
      });
    } catch (error: unknown) {
      this.fileService.deleteFile(filename).catch((err: unknown) => {
        this.logger.error("R2 rollback failed after DB create error", {
          filename,
          err,
        });
      });
      throw error;
    }

    return { success: true, filename };
  }

  public async getSignedResumeUrl(
    resumeId: string,
    profileId: string,
  ): Promise<TViewUrlResponse> {
    const resume = await this._findById(resumeId, profileId);

    if (!resume.url) {
      throw new BadRequestException(
        "This resume does not have a downloadable file",
      );
    }

    const url = await this.fileService.getSignedUrl(resume.url);
    return { url };
  }

  public async setAsPrimary(
    resumeId: string,
    profileId: string,
  ): Promise<void> {
    const resume = await this._findById(resumeId, profileId);
    if (resume.isPrimary) {
      return;
    }

    await this.db.withTransaction(async (tx) => {
      await this.db.update("resume", { isPrimary: false }, { profileId }, tx);
      await this.db.update("resume", { isPrimary: true }, { id: resumeId }, tx);
    });
  }

  public async delete(resumeId: string, profileId: string): Promise<void> {
    const resume = await this._findById(resumeId, profileId);

    if (resume.url) {
      await this.fileService.deleteFile(resume.url);
    }

    await this.db.delete("resume", { id: resumeId });
  }

  public async extractResume(
    resumeId: string,
    provider: TApiKeyProvider,
    profileId: string,
  ): Promise<ExtractionResult> {
    const resume = await this._findById(resumeId, profileId);

    if (!resume.url) {
      throw new BadRequestException(
        "This resume does not have a PDF file to extract from",
      );
    }

    const cached = this._deserializeContent(resume.content);
    if (cached) {
      return cached as unknown as ExtractionResult;
    }

    return this._extractAndStore(resume, provider);
  }

  private async _extractAndStore(
    resume: TResume,
    provider: TApiKeyProvider,
  ): Promise<ExtractionResult> {
    if (!resume.url) {
      throw new BadRequestException(
        "This resume does not have a PDF file to extract from",
      );
    }

    const extractedText = await this._pdfToText(resume.url);

    const extracted = await this.genAiService.extractResume(
      extractedText,
      provider,
    );

    // important to keep it out of the array to avoid deadlock situation
    const skills = await this.lookupsService.resolveOrCreateNames(
      "topics",
      extracted.professional.skills,
    );

    const [industries, titles, projectSkillIds] = await Promise.all([
      this.lookupsService.resolveOrCreateNames(
        "industries",
        extracted.professional.industries,
      ),
      this.lookupsService.resolveOrCreateNames(
        "roles",
        extracted.preferences.titles,
      ),
      this.lookupsService.resolveOrCreateNames(
        "topics",
        extracted.projects.flatMap((project) => project.skills ?? []),
      ),
    ]);

    let skillIndex = 0;
    const projects = extracted.projects.map((project) => {
      const count = (project.skills ?? []).length;
      const resolved = projectSkillIds.slice(skillIndex, skillIndex + count);
      skillIndex += count;
      return { ...project, skills: resolved };
    });

    const result = {
      ...extracted,
      professional: { ...extracted.professional, skills, industries },
      preferences: { ...extracted.preferences, titles },
      projects,
    };

    // Persist so future fill-profile / scoring / review / interview skip the AI call.
    await this.db.update(
      "resume",
      { content: JSON.stringify(result) },
      { id: resume.id },
    );

    return result;
  }

  public async scoreResumeForJob(
    dto: ScoreResumeDto,
    userId: string,
  ): Promise<TAtsScore> {
    const { jobId, resumeId, provider, model } = dto;

    const resumeText = await this.resumeToText({ resumeId, userId, provider });

    const job = (await this.db.findById("jobs", jobId, {
      filter: { ...(userId ? { userId } : {}) },
      relation: { company: true },
    })) as TJobWithCompany;

    if (!job.description) {
      throw new BadRequestException(
        "This job has no description to score against",
      );
    }

    const companyName = job.company?.name ?? job.companyName;
    const companyDetails = job.company?.researchDossier
      ? typeof job.company.researchDossier === "string"
        ? job.company.researchDossier
        : JSON.stringify(job.company.researchDossier)
      : "";

    return this.genAiService.scoreResumeForJob({
      provider,
      resume: resumeText,
      jobDescription: job.description,
      company: companyName,
      companyDetails,
      model,
    });
  }

  public async reviewResumeStandalone(
    dto: ReviewStandaloneDto,
    userId: string,
  ): Promise<TStandaloneReview> {
    const { resumeId, provider, model } = dto;

    const resumeText = await this.resumeToText({
      resumeId,
      userId,
      provider,
    });

    return this.genAiService.reviewResumeStandalone({
      provider,
      resume: resumeText,
      model,
    });
  }

  private async _findById(
    resumeId: string,
    profileId: string,
  ): Promise<TResume> {
    return this.db.findById("resume", resumeId, {
      filter: { profileId },
    });
  }

  private _deserializeContent(value: string | null): TResumeContent | null {
    if (!value) return null;

    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "object" || parsed === null) return null;
      return parsed as TResumeContent;
    } catch {
      return null;
    }
  }

  private _mapResume(row: TResume): TResumeResponse {
    return { ...row, content: this._deserializeContent(row.content) };
  }

  public async resumeToText({
    resumeId,
    userId,
    provider,
  }: {
    resumeId?: string;
    userId: string;
    provider: TApiKeyProvider;
  }): Promise<string> {
    const resume = resumeId
      ? await this._findById(resumeId, userId)
      : (
          await this.db.findAllByColumn("resume", {
            filter: { profileId: userId, isPrimary: true },
          })
        )[0];
    const content = this._deserializeContent(resume.content);
    if (content) {
      return this._contentToJson(content);
    }

    const extracted = await this._extractAndStore(resume, provider);
    return this._contentToJson(extracted as unknown as TResumeContent);
  }

  private async _pdfToText(url: string): Promise<string> {
    const pdfBuffer = await this.fileService.downloadFile(url);

    let extractedText: string;
    try {
      const result = await extractText(
        new Uint8Array(
          pdfBuffer.buffer,
          pdfBuffer.byteOffset,
          pdfBuffer.byteLength,
        ),
        { mergePages: true },
      );
      extractedText = result.text.trim();
    } catch (err) {
      this.logger.error("Failed to extract text from PDF", {
        message: err instanceof Error ? err.message : String(err),
      });
      throw new BadRequestException("Failed to extract text from PDF");
    }

    if (!extractedText) {
      throw new BadRequestException(
        "No text could be extracted from the resume",
      );
    }

    return extractedText;
  }

  private async _contentToJson(content: TResumeContent): Promise<string> {
    const topicIds = new Set<number>([
      ...(content.professional.skills ?? []),
      ...content.projects.flatMap((project) => project.skills ?? []),
    ]);
    const industryIds = content.professional.industries ?? [];
    const roleIds = content.preferences.titles ?? [];

    const [topics, industries, roles] = await Promise.all([
      topicIds.size > 0
        ? this.db.findAllByColumn("topics", { filter: { id: [...topicIds] } })
        : [],
      industryIds.length > 0
        ? this.db.findAllByColumn("industries", {
            filter: { id: industryIds },
          })
        : [],
      roleIds.length > 0
        ? this.db.findAllByColumn("roles", { filter: { id: roleIds } })
        : [],
    ]);

    const topicMap = new Map<number, string>(
      topics.map((topic) => [topic.id, topic.name]),
    );

    const base = {
      professional: {
        ...content.professional,
        skills: content.professional.skills
          ?.map((skill) => topicMap.get(skill))
          .filter(Boolean),
        industries: industries.map((i) => i.name),
      },
      preferences: {
        ...content.preferences,
        titles: roles.map((r) => r.name),
      },
      projects: content.projects.map((project) => ({
        ...project,
        skills: project.skills?.map((skill) => topicMap.get(skill)),
      })),
    };

    return JSON.stringify({
      personal: omitKeys(content.personal, [
        "phone",
        "email",
        "location",
        "country",
      ]),
      ...base,
      preferences: omitKeys(base.preferences, ["preferredLocation"]),
      workExperience: content.workExperience.map((exp) =>
        omitKeys(exp, ["id", "companyId", "startDate", "endDate"]),
      ),
      education: content.education.map((ed) =>
        omitKeys(ed, ["id", "location", "startDate", "endDate"]),
      ),
      projects: base.projects.map((project) =>
        omitKeys(project, ["id", "link"]),
      ),
      publications: content.publications.map((pub) =>
        omitKeys(pub, ["id", "link"]),
      ),
      activities: content.activities.map((activity) =>
        omitKeys(activity, ["id", "startDate", "endDate"]),
      ),
    }).slice(0, 12000);
  }

  private async _checkQuota(profileId: string): Promise<number> {
    const existing = await this.db.findAllByColumn("resume", {
      filter: { profileId },
    });

    if (existing.length >= MAX_RESUMES) {
      throw new BadRequestException(
        `You can only have up to ${MAX_RESUMES} resumes`,
      );
    }
    return existing.length;
  }
}
