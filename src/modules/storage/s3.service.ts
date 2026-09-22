import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export interface UploadedObject {
  key: string;
  url: string;
}

/**
 * Ticket attachments used to be saved to local disk (see git history) —
 * fine for a single dev machine, but almost every hosting free tier wipes
 * the filesystem on every redeploy/restart, which would silently delete
 * every uploaded attachment. This replaces that with S3, kept behind a
 * small interface so ticket.service.ts doesn't need to know AWS SDK
 * specifics.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly region = process.env.AWS_REGION ?? '';
  private readonly bucket = process.env.AWS_S3_BUCKET ?? '';
  // Built lazily, on first actual use — constructing S3Client eagerly
  // throws immediately if AWS_REGION is unset, which would crash the
  // whole app at boot (NestJS instantiates every provider on startup)
  // rather than just the upload feature that actually needs it.
  private client: S3Client | null = null;

  async upload(file: Express.Multer.File): Promise<UploadedObject> {
    const key = `attachments/${randomUUID()}${extname(file.originalname)}`;

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { key, url: this.urlFor(key) };
  }

  /** Best-effort — an object that's already gone (or a URL from before
   * this migration, still pointing at local disk) shouldn't fail the
   * request; the DB row is what the UI actually reflects. */
  async delete(url: string): Promise<void> {
    const key = this.keyFromUrl(url);
    if (!key) return;

    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete S3 object "${key}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private getClient(): S3Client {
    if (!this.region || !this.bucket) {
      throw new InternalServerErrorException(
        'S3 is not configured — set AWS_REGION, AWS_S3_BUCKET, ' +
          'AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in .env (see .env.example).',
      );
    }
    this.client ??= new S3Client({ region: this.region });
    return this.client;
  }

  private urlFor(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private keyFromUrl(url: string): string | null {
    const prefix = this.urlFor('');
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}
