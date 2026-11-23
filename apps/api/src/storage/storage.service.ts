import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRESIGNED_URL_TTL_SECONDS = 300;

/**
 * Thin wrapper over any S3-compatible object store (MinIO locally, S3 or
 * an S3-compatible provider in production). Every file ever goes through
 * a short-lived presigned URL — nothing is ever served from a public
 * bucket/URL, and this class is the only place in the codebase that
 * talks to the storage backend directly.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow("S3_BUCKET");
    this.client = new S3Client({
      endpoint: config.getOrThrow("S3_ENDPOINT"),
      region: config.getOrThrow("S3_REGION"),
      forcePathStyle: String(config.get("S3_FORCE_PATH_STYLE")) === "true",
      credentials: {
        accessKeyId: config.getOrThrow("S3_ACCESS_KEY_ID"),
        secretAccessKey: config.getOrThrow("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  /** Best-effort: creates the bucket if it doesn't exist yet. Never blocks app startup on storage being unreachable. */
  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created storage bucket "${this.bucket}"`);
      } catch (e) {
        this.logger.warn(`Could not reach or create storage bucket "${this.bucket}": ${(e as Error).message}`);
      }
    }
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
  }

  async getDownloadUrl(key: string, filename: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
