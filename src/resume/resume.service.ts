import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { extractText } from "unpdf";

import { IDatabaseService } from "@/src/database/database.service";
import type { TResume, TApiKeyProvider } from "@/src/database/database.types";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";
import { ExtractionResult } from "@/src/resume/resume.dto";
import {
  FileUploadService,
  TUploadResponse,
  TViewUrlResponse,
} from "@/src/utilities/upload/file-upload.service";

const MAX_RESUMES = 5;

@Injectable()
export class ResumeService {
  constructor(
    private readonly fileService: FileUploadService,
    private readonly db: IDatabaseService,
    private readonly genAiService: GenAiService,
    private readonly lookupsService: LookupsService,
  ) {}

  public async findAll(profileId: string): Promise<TResume[]> {
    return this.db.findAllByColumn("resume", {
      filter: { profileId },
    });
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
    } catch (error) {
      await this.fileService.deleteFile(filename);
      throw error;
    }

    return { success: true, filename };
  }

  public async getSignedResumeUrl(
    resumeId: string,
    profileId: string,
  ): Promise<TViewUrlResponse> {
    const resumes = await this.db.findAllByColumn("resume", {
      filter: { id: resumeId },
    });

    if (resumes.length === 0) {
      throw new NotFoundException("Resume not found");
    }

    const resume = resumes[0];
    if (resume.profileId !== profileId) {
      throw new ForbiddenException(
        "You do not have permission to view this resume",
      );
    }
    const url = await this.fileService.getSignedUrl(resume.url);

    return { url };
  }

  public async setAsPrimary(
    resumeId: string,
    profileId: string,
  ): Promise<void> {
    const resumes = await this.db.findAllByColumn("resume", {
      filter: { profileId },
    });

    const target = resumes.find((r) => r.id === resumeId);
    if (!target) throw new NotFoundException("Resume not found");
    if (target.isPrimary) return;

    await this.db.withTransaction(async (tx) => {
      await this.db.update("resume", { isPrimary: false }, { profileId }, tx);
      await this.db.update("resume", { isPrimary: true }, { id: resumeId }, tx);
    });
  }

  public async delete(resumeId: string, profileId: string): Promise<void> {
    const resumes = await this.db.findAllByColumn("resume", {
      filter: { id: resumeId },
    });

    if (resumes.length === 0) {
      throw new NotFoundException("Resume not found");
    }

    const resume = resumes[0];
    if (resume.profileId !== profileId)
      throw new ForbiddenException("You do not have permission to delete");

    await this.db.delete("resume", { id: resumeId });

    await this.fileService.deleteFile(resume.url);
  }

  public async extractFromProfile(
    resumeId: string,
    provider: TApiKeyProvider,
    profileId: string,
  ): Promise<ExtractionResult> {
    const resume = await this.db.findById("resume", resumeId);

    if (resume.profileId !== profileId) {
      throw new ForbiddenException(
        "You do not have permission to access this resume",
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

    const [skills, industries, titles] = await Promise.all([
      this.lookupsService.resolveOrCreateNames(
        "topics",
        extracted.professional.skills,
      ),
      this.lookupsService.resolveOrCreateNames(
        "industries",
        extracted.professional.industries,
      ),
      this.lookupsService.resolveOrCreateNames(
        "roles",
        extracted.preferences.titles,
      ),
    ]);

    return {
      ...extracted,
      professional: { ...extracted.professional, skills, industries },
      preferences: { ...extracted.preferences, titles },
    };
  }
}
