import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
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
  ) {}
  public async uploadResume(
    file: Express.Multer.File,
    profileId: string,
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
        name: file.originalname,
        url: filename,
        isPrimary: existing.length === 0,
      });
    } catch (error) {
      await this.fileService.deleteFile(filename);
      throw error;
    }

    return { success: true, filename };
  }

  public async getResumeSignedUrl(
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

  public async setResumePrimary(
    resumeId: string,
    profileId: string,
  ): Promise<void> {
    const resumes = await this.db.findAllByColumn("resume", { profileId });

    const target = resumes.find((r) => r.id === resumeId);
    if (!target) throw new NotFoundException("Resume not found");
    if (target.isPrimary) return;

    for (const resume of resumes) {
      await this.db.update("resume", { isPrimary: resume.id === resumeId }, {
        id: resume.id,
      });
    }
  }

  public async deleteResume(
    resumeId: string,
    profileId: string,
  ): Promise<void> {
    const resumes = await this.db.findAllByColumn("resume", { id: resumeId });

    if (resumes.length === 0) {
      throw new NotFoundException("Resume not found");
    }

    const resume = resumes[0];
    if (resume.profileId !== profileId)
      throw new ForbiddenException("You do not have permission to delete");

    await this.db.delete("resume", { id: resumeId });

    await this.fileService.deleteFile(resume.url);
  }
}
