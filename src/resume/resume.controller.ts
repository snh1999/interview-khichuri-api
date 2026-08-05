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
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

import { UserId } from "@/src/config/guards/user-id.decorator";
import {
  CreateResumeDto,
  ExtractionResult,
  ExtractResumeDto,
  UpdateResumeDto,
} from "@/src/resume/resume.dto";
import {
  TUploadResponse,
  TViewUrlResponse,
} from "@/src/utilities/upload/file-upload.service";

import { ResumeService, TResumeResponse } from "./resume.service";

@Controller("resume")
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Get()
  public findAll(@UserId() userId?: string): Promise<TResumeResponse[]> {
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

  @Post("create")
  public create(
    @Body() dto: CreateResumeDto,
    @UserId() userId?: string,
  ): Promise<TResumeResponse> {
    return this.resumeService.createFromContent(userId ?? "app", dto);
  }

  @Get("slug/:slug")
  @AllowAnonymous()
  public findBySlug(@Param("slug") slug: string): Promise<TResumeResponse> {
    return this.resumeService.findBySlug(slug);
  }

  @Get(":id")
  public findById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<TResumeResponse> {
    return this.resumeService.findById(id);
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

  @Patch(":id")
  public update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateResumeDto,
    @UserId() userId?: string,
  ): Promise<TResumeResponse> {
    return this.resumeService.update(id, userId ?? "app", dto);
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
