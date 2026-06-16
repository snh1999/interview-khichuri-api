import {
  Controller,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import {
  FileUploadService,
  TUploadResponse,
} from "@/src/utilities/upload/file-upload.service";

@Controller("upload")
export class FileUploadController {
  constructor(private readonly uploadService: FileUploadService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 1024 * 1024 * 5 },
    }),
  )
  public uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(image\/png|image\/jpeg|application\/pdf)/,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({ maxSize: 1024 * 1024 * 5 })
        .build(),
    )
    file: Express.Multer.File,
  ): Promise<TUploadResponse> {
    return this.uploadService.uploadFile(file);
  }
}
