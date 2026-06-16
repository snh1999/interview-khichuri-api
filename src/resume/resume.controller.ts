import {
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
import {
  TUploadResponse,
  TViewUrlResponse,
} from "@/src/utilities/upload/file-upload.service";

import { ResumeService } from "./resume.service";

@Controller("resume")
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 1024 * 1024 * 5 },
    }),
  )
  public uploadResume(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /application\/pdf/,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({ maxSize: 1024 * 1024 * 5 })
        .build(),
    )
    file: Express.Multer.File,
    @UserId() userId?: string,
  ): Promise<TUploadResponse> {
    return this.resumeService.uploadResume(file, userId ?? "app");
  }

  @Get(":id/url")
  public getResumeUrl(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<TViewUrlResponse> {
    return this.resumeService.getResumeSignedUrl(id, userId ?? "app");
  }

  @Patch(":id/primary")
  public setResumePrimary(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.resumeService.setResumePrimary(id, userId ?? "app");
  }

  @Delete(":id")
  public deleteResume(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.resumeService.deleteResume(id, userId ?? "app");
  }
}
