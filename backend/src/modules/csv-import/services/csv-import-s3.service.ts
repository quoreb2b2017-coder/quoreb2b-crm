import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
  BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { createReadStream } from 'fs';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class CsvImportS3Service implements OnModuleInit {
  private readonly logger = new Logger(CsvImportS3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET', '');
    this.prefix = this.config.get<string>('CSV_IMPORT_S3_PREFIX', 'csv-imports');
    this.region = this.config.get<string>('AWS_REGION', 'ap-south-1');

    const accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');

    if (this.bucket && accessKey && secretKey) {
      this.client = new S3Client({
        region: this.region,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        maxAttempts: 3,
      });
    } else {
      this.client = null;
      this.logger.warn(
        'S3 not configured (AWS_S3_BUCKET / credentials missing) — CSV imports use local disk fallback',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.client || !this.bucket) return;
    try {
      await this.ensureBucketExists();
      await this.ensureCorsConfiguration();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`S3 bootstrap failed for bucket ${this.bucket}: ${msg}`);
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  buildImportKey(jobId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.prefix}/${jobId}/${safeName}`;
  }

  buildErrorCsvKey(jobId: string): string {
    return `${this.prefix}/${jobId}/errors.csv`;
  }

  async createPresignedUploadUrl(
    s3Key: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<{ uploadUrl: string; expiresIn: number }> {
    this.assertEnabled();
    const maxBytes = this.config.get<number>('CSV_IMPORT_MAX_FILE_BYTES', 2 * 1024 ** 3);
    if (fileSizeBytes > maxBytes) {
      throw new BadRequestException(
        `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB`,
      );
    }

    const expiresIn = this.config.get<number>('CSV_IMPORT_PRESIGN_TTL_SECONDS', 3600);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: contentType || 'text/csv',
      ContentLength: fileSizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.client!, command, { expiresIn });
    return { uploadUrl, expiresIn };
  }

  async uploadLocalFile(localPath: string, s3Key: string, contentType?: string): Promise<void> {
    this.assertEnabled();
    const upload = new Upload({
      client: this.client!,
      params: {
        Bucket: this.bucket,
        Key: s3Key,
        Body: createReadStream(localPath),
        ContentType: contentType || 'text/csv',
      },
      queueSize: 4,
      partSize: 10 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await upload.done();
  }

  async uploadBuffer(
    body: Buffer | Readable,
    s3Key: string,
    contentType: string,
  ): Promise<void> {
    this.assertEnabled();
    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async headObject(s3Key: string): Promise<{ size: number; etag: string }> {
    this.assertEnabled();
    const res = await this.client!.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );
    return {
      size: res.ContentLength ?? 0,
      etag: (res.ETag ?? '').replace(/"/g, ''),
    };
  }

  async getObjectStream(s3Key: string): Promise<Readable> {
    this.assertEnabled();
    const res = await this.client!.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );
    if (!res.Body) {
      throw new BadRequestException('S3 object body is empty');
    }
    return res.Body as Readable;
  }

  async deleteObject(s3Key: string): Promise<void> {
    if (!this.client || !s3Key) return;
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }))
      .catch((err) => {
        this.logger.warn(`Failed to delete S3 object ${s3Key}: ${err}`);
      });
  }

  getBucket(): string {
    return this.bucket;
  }

  /** Local disk fallback path when S3 is not configured. */
  localFallbackPath(jobId: string, fileName: string): string {
    const dir = join(process.cwd(), 'uploads', 'csv-imports', jobId);
    mkdirSync(dir, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `${randomUUID()}.csv`;
    return join(dir, safeName);
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client!.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket ready: ${this.bucket}`);
    } catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      const name = (err as { name?: string })?.name;
      if (status === 404 || name === 'NotFound' || name === 'NoSuchBucket') {
        this.logger.warn(`Creating S3 bucket ${this.bucket} in ${this.region}`);
        const input: {
          Bucket: string;
          CreateBucketConfiguration?: { LocationConstraint: BucketLocationConstraint };
        } = { Bucket: this.bucket };
        if (this.region !== 'us-east-1') {
          input.CreateBucketConfiguration = {
            LocationConstraint: this.region as BucketLocationConstraint,
          };
        }
        await this.client!.send(new CreateBucketCommand(input));
        this.logger.log(`Created S3 bucket ${this.bucket}`);
      } else {
        throw err;
      }
    }
  }

  private async ensureCorsConfiguration(): Promise<void> {
    const origins = this.resolveCorsOrigins();
    await this.client!.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
              AllowedOrigins: origins,
              ExposeHeaders: ['ETag', 'x-amz-request-id'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    this.logger.log(`S3 CORS configured for ${origins.length} origin(s)`);
  }

  private resolveCorsOrigins(): string[] {
    const raw = this.config.get<string>('CORS_ORIGINS', '');
    const fromEnv = raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const defaults = [
      'https://crm.quoreb2b.com',
      'http://localhost:3000',
      'https://65-2-186-189.sslip.io',
    ];
    return [...new Set([...fromEnv, ...defaults])];
  }

  private assertEnabled(): void {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'S3 is not configured. Set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
      );
    }
  }
}
