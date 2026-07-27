import { Module } from "@nestjs/common";

import { FileUploadController } from "./upload/file-upload.controller";
import { FileUploadService } from "./upload/file-upload.service";

@Module({
  controllers: [FileUploadController],
  providers: [FileUploadService],
  exports: [FileUploadService],
})
export class UtilitiesModule {}
