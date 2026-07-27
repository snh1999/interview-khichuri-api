import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { UserId } from "@/src/config/guards/user-id.decorator";
import type { TResume } from "@/src/database/database.types";
import { ExtractionResult, ExtractResumeDto } from "@/src/resume/resume.dto";
import {
  TUploadResponse,
  TViewUrlResponse,
} from "@/src/utilities/upload/file-upload.service";

import { ResumeService } from "./resume.service";

@Controller("resume")
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Get()
  public findAll(@UserId() userId?: string): Promise<TResume[]> {
    return this.resumeService.findAll(userId ?? "app");
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 1024 * 1024 * 5 },
    }),
  )
  public upload(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /application\/pdf/,
        })
        .addMaxSizeValidator({ maxSize: 1024 * 1024 * 5 })
        .build(),
    )
    file: Express.Multer.File,
    @Body("name") name?: string,
    @UserId() userId?: string,
  ): Promise<TUploadResponse> {
    return this.resumeService.upload(file, userId ?? "app", name);
  }

  @Post(":id/extract")
  public extractFromProfile(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ExtractResumeDto,
    @UserId() userId?: string,
  ): Promise<ExtractionResult> {
    return this.resumeService.extractFromProfile(
      id,
      dto.provider,
      userId ?? "app",
    );
  }

  @Get(":id/url")
  public getResumeUrl(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TViewUrlResponse> {
    return this.resumeService.getSignedResumeUrl(id, userId ?? "app");
  }

  @Patch(":id/primary")
  public setAsPrimary(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.resumeService.setAsPrimary(id, userId ?? "app");
  }

  @Delete(":id")
  public delete(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.resumeService.delete(id, userId ?? "app");
  }
}
