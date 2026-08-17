import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { extractText } from "unpdf";

import { IDatabaseService } from "@/src/database/database.service";
import type { TApiKeyProvider, TResume } from "@/src/database/database.types";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";
import {
  CreateResumeDto,
  ExtractionResult,
  type TResumeContent,
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

  public async createFromContent(
    profileId: string,
    data: CreateResumeDto,
  ): Promise<TResumeResponse> {
    const existing = await this.db.findAllByColumn("resume", {
      filter: { profileId },
    });

    if (existing.length >= MAX_RESUMES) {
      throw new BadRequestException(
        `You can only have up to ${MAX_RESUMES} resumes`,
      );
    }

    return this._mapResume(
      await this.db.create("resume", {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...data,
        profileId,
        content: JSON.stringify(data.content),
        isPrimary: existing.length === 0,
      }),
    );
  }

  public async update(
    resumeId: string,
    profileId: string,
    data: {
      name?: string;
      content?: TResumeContent;
      template?: string;
      isPublic?: boolean;
    },
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
        ...data,
        slug,
        content: data.content ? JSON.stringify(data.content) : undefined,
      },
      {
        id: resumeId,
      },
    );

    return this._mapResume(updated);
  }

  public async upload(
    file: Express.Multer.File,
    profileId: string,
    name?: string,
  ): Promise<TUploadResponse> {
    const existing = await this.db.findAllByColumn("resume", {
      filter: { profileId },
    });

    if (existing.length >= MAX_RESUMES) {
      throw new BadRequestException(
        `You can only upload up to ${MAX_RESUMES} resumes`,
      );
    }

    const { filename } = await this.fileService.uploadFile(
      file,
      profileId,
      "resumes",
    );

    try {
      await this.db.create("resume", {
        profileId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        name: name?.trim() || file.originalname,
        url: filename,
        isPrimary: existing.length === 0,
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

  public async extractFromProfile(
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

    const pdfBuffer = await this.fileService.downloadFile(resume.url);

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
      console.error(err);
      throw new BadRequestException("Failed to extract text from PDF");
    }

    if (!extractedText) {
      throw new BadRequestException(
        "No text could be extracted from the resume",
      );
    }

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

    return {
      ...extracted,
      professional: { ...extracted.professional, skills, industries },
      preferences: { ...extracted.preferences, titles },
      projects,
    };
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
}
