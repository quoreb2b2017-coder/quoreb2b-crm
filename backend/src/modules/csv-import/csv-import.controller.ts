import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { CsvImportService } from './csv-import.service';
import { InitiateCsvImportDto, StartCsvImportDto } from './dto/initiate-csv-import.dto';
import { CsvImportControlDto } from './dto/csv-import-control.dto';
import { actorFromJwt } from '../activity-logs/activity-user.util';

const uploadDir = join(process.cwd(), 'uploads', 'csv-imports', 'staging');
mkdirSync(uploadDir, { recursive: true });

@Controller('csv-imports')
export class CsvImportController {
  constructor(private readonly csvImport: CsvImportService) {}

  @Post('presign')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  presign(
    @Body() dto: InitiateCsvImportDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    const actor = actorFromJwt(user);
    return this.csvImport.initiatePresignedUpload(dto, {
      userId: actor.id,
      email: actor.email ?? '',
    });
  }

  @Post(':jobId/start')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  start(@Param('jobId') jobId: string, @Body() dto: StartCsvImportDto) {
    return this.csvImport.confirmUploadAndStart(jobId, dto.contentHash);
  }

  @Post('upload')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.csv';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (ext !== '.csv') {
          cb(new Error('Only .csv files are supported for enterprise import'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('mode') mode: 'replace' | 'append' = 'replace',
    @Body('batchSize') batchSize: string | undefined,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    const actor = actorFromJwt(user);
    return this.csvImport.uploadAndQueue(
      file.path,
      file.originalname,
      file.size,
      mode,
      { userId: actor.id, email: actor.email ?? '' },
      batchSize ? parseInt(batchSize, 10) : undefined,
    );
  }

  @Get(':jobId')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getStatus(@Param('jobId') jobId: string) {
    return this.csvImport.getJob(jobId);
  }

  @Post(':jobId/control')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  control(@Param('jobId') jobId: string, @Body() dto: CsvImportControlDto) {
    return this.csvImport.controlJob(jobId, dto.action);
  }

  @Get(':jobId/errors/download-url')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  errorCsvUrl(@Param('jobId') jobId: string) {
    return this.csvImport.getErrorCsvPresignedUrl(jobId);
  }
}
