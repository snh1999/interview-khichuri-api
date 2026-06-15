import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface TUploadResponse {
  success: boolean;
  filename: string;
}

@Injectable()
export class FileUploadService {
  private s3: S3Client;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: this.config.get("R2_REGION") ?? "auto",
      endpoint: this.config.getOrThrow("R2_ENDPOINT"),
      credentials: {
        accessKeyId: this.config.getOrThrow("R2_ACCESS_KEY"),
        secretAccessKey: this.config.getOrThrow("R2_SECRET_KEY"),
      },
    });
  }

  public async uploadFile(file: Express.Multer.File): Promise<TUploadResponse> {
    const filename = `${file.originalname}-${Date.now()}`;
    const cmd = new PutObjectCommand({
      Bucket: this.config.getOrThrow("R2_BUCKET_NAME"),
      Key: filename,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3.send(cmd);
    return { success: true, filename };
  }
}
