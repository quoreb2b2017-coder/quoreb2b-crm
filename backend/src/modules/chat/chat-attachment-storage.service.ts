import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { Readable } from 'stream';

const CHAT_ATTACH_PREFIX = 'chat-attachments';
const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024;

@Injectable()
export class ChatAttachmentStorageService implements OnModuleInit {
  private readonly logger = new Logger(ChatAttachmentStorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly localRoot: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET', '');
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');
    this.localRoot = join(process.cwd(), 'uploads', 'chat-attachments');
    if (this.bucket && accessKey && secretKey) {
      this.client = new S3Client({
        region: this.config.get<string>('AWS_REGION', 'ap-south-1'),
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        maxAttempts: 3,
      });
    } else {
      this.client = null;
      this.logger.warn('Chat attachments using local disk (S3 not configured)');
    }
  }

  onModuleInit(): void {
    if (!this.client) {
      mkdirSync(this.localRoot, { recursive: true });
    }
  }

  isS3Enabled(): boolean {
    return this.client !== null;
  }

  buildKey(conversationId: string, fileName: string): string {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    const id = randomBytes(8).toString('hex');
    return `${CHAT_ATTACH_PREFIX}/${conversationId}/${id}-${safe}`;
  }

  assertOwnedKey(conversationId: string, key: string): void {
    const expected = `${CHAT_ATTACH_PREFIX}/${conversationId}/`;
    if (!key.startsWith(expected) || key.includes('..')) {
      throw new BadRequestException('Invalid attachment key');
    }
  }

  async createPresignedUpload(
    conversationId: string,
    fileName: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<{
    key: string;
    uploadUrl: string | null;
    storage: 's3' | 'local';
    expiresIn: number;
    maxBytes: number;
  }> {
    if (fileSizeBytes > MAX_CHAT_FILE_BYTES) {
      throw new BadRequestException(
        `File exceeds ${Math.round(MAX_CHAT_FILE_BYTES / 1024 / 1024)} MB limit`,
      );
    }
    const key = this.buildKey(conversationId, fileName);
    if (!this.client) {
      return {
        key,
        uploadUrl: null,
        storage: 'local',
        expiresIn: 0,
        maxBytes: MAX_CHAT_FILE_BYTES,
      };
    }
    const expiresIn = 900;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
        ContentLength: fileSizeBytes,
      }),
      { expiresIn },
    );
    return { key, uploadUrl, storage: 's3', expiresIn, maxBytes: MAX_CHAT_FILE_BYTES };
  }

  async saveLocalUpload(key: string, buffer: Buffer): Promise<void> {
    this.assertLocalRoot();
    const full = this.localPath(key);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, buffer);
  }

  async createDownloadUrl(
    key: string,
    storage: string,
    fileName: string,
  ): Promise<{ url: string; mode: 'redirect' | 'stream-token' }> {
    if (storage === 's3' && this.client) {
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
        }),
        { expiresIn: 600 },
      );
      return { url, mode: 'redirect' };
    }
    // Local: caller streams via authenticated API path
    return { url: '', mode: 'stream-token' };
  }

  openLocalReadStream(key: string): Readable {
    const full = this.localPath(key);
    if (!existsSync(full)) {
      throw new ServiceUnavailableException('Attachment file missing');
    }
    return createReadStream(full);
  }

  localPath(key: string): string {
    if (!key.startsWith(CHAT_ATTACH_PREFIX + '/')) {
      throw new BadRequestException('Invalid key');
    }
    return join(this.localRoot, key.slice(CHAT_ATTACH_PREFIX.length + 1));
  }

  async deleteObject(key: string, storage: string): Promise<void> {
    try {
      if (storage === 's3' && this.client) {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        return;
      }
      const full = this.localPath(key);
      if (existsSync(full)) unlinkSync(full);
    } catch (err) {
      this.logger.warn(`Failed to delete chat attachment ${key}: ${err instanceof Error ? err.message : err}`);
    }
  }

  async headExists(key: string, storage: string): Promise<boolean> {
    try {
      if (storage === 's3' && this.client) {
        await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return true;
      }
      return existsSync(this.localPath(key));
    } catch {
      return false;
    }
  }

  private assertLocalRoot(): void {
    mkdirSync(this.localRoot, { recursive: true });
  }
}
