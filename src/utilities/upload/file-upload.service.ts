import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { IDatabaseService } from "@/src/database/database.service";

export interface TUploadResponse {
  success: boolean;
  filename: string;
}

export interface TViewUrlResponse {
  url: string;
}

const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png"];

@Injectable()
export class FileUploadService {
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly logger = new Logger(FileUploadService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: IDatabaseService,
  ) {
    this.bucketName = this.config.getOrThrow("R2_BUCKET_NAME");
    this.s3 = new S3Client({
      region: this.config.get("R2_REGION") ?? "auto",
      endpoint: this.config.getOrThrow("R2_ENDPOINT"),
      credentials: {
        accessKeyId: this.config.getOrThrow("R2_ACCESS_KEY"),
        secretAccessKey: this.config.getOrThrow("R2_SECRET_KEY"),
      },
    });
  }

  public async uploadFile(
    file: Express.Multer.File,
    profileId?: string,
    filePrefix?: string,
  ): Promise<TUploadResponse> {
    const ext = path.extname(file.originalname);
    if (!ALLOWED_EXT.includes(ext))
      throw new BadRequestException("File type not allowed");

    const filename = `${filePrefix ?? "files"}/${profileId}/${randomUUID()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { success: true, filename };
  }

  public async deleteFile(filename: string): Promise<void> {
    await this.s3
      .send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: filename,
        }),
      )
      .catch((err: unknown) => {
        this.logger.error("S3 rollback failed", {
          url: filename,
          err,
        });
      });
  }

  public async downloadFile(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
    const body = await response.Body?.transformToByteArray();
    return Buffer.from(body ?? []);
  }

  public async getSignedUrl(
    key: string,
    expiresIn: number = 7 * 24 * 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ResponseContentDisposition: "inline",
        ResponseContentType: "application/pdf",
      }),
      { expiresIn },
    );
  }
}
