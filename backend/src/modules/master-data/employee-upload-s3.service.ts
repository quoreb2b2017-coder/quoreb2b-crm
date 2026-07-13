import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'fs';
import { randomBytes } from 'crypto';

@Injectable()
export class EmployeeUploadS3Service {
  private readonly logger = new Logger(EmployeeUploadS3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET', '');
    this.prefix = this.config.get<string>(
      'EMPLOYEE_UPLOAD_S3_PREFIX',
      'employee-uploads',
    );
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');
    if (this.bucket && accessKey && secretKey) {
      this.client = new S3Client({
        region: this.config.get<string>('AWS_REGION', 'ap-south-1'),
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        maxAttempts: 3,
      });
    } else {
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  getBucket(): string {
    return this.bucket;
  }

  buildKey(jobId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.prefix}/${jobId}/${safeName}`;
  }

  buildMasterImportKey(jobId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const prefix = this.config.get<string>('MASTER_IMPORT_S3_PREFIX', 'master-imports');
    return `${prefix}/${jobId}/${safeName}`;
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
        ContentType: contentType || 'application/octet-stream',
      },
      queueSize: 4,
      partSize: 10 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await upload.done();
  }

  async headObject(s3Key: string): Promise<{ size: number }> {
    this.assertEnabled();
    const res = await this.client!.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );
    return { size: res.ContentLength ?? 0 };
  }

  generateJobId(): string {
    return randomBytes(12).toString('hex');
  }

  private assertEnabled(): void {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'S3 is not configured. Set AWS_S3_BUCKET and credentials.',
      );
    }
  }
}
