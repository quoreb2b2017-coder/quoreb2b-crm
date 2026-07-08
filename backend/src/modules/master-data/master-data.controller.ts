import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterDataService } from './master-data.service';
import { SaveMasterDataDto } from './dto/save-master-data.dto';
import { SearchMasterDataDto } from './dto/search-master-data.dto';
import { MasterDataColumnOptionsQueryDto } from './dto/column-options.dto';
import {
  CreateMasterDataUploadRequestDto,
  DbReviewEmployeeUploadDto,
  ListMasterDataUploadRequestsDto,
  ReviewMasterDataUploadRequestDto,
  UpdateEmployeeWorkDataDto,
} from './dto/master-data-upload-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { actorFromJwt } from '../activity-logs/activity-user.util';
import { ImportMasterDataFileDto } from './dto/import-master-data-file.dto';
import {
  masterDataImportMulterOptions,
  type MasterDataUploadRequest,
} from './master-data-upload.storage';
import {
  formatMemoryUsage,
  logMasterDataUploadSaved,
} from './master-data-upload.metrics';

@Controller({ path: 'master-data', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class MasterDataController {
  private readonly logger = new Logger(MasterDataController.name);

  constructor(private masterDataService: MasterDataService) {}

  @Post()
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  save(
    @Body() dto: SaveMasterDataDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.save(dto, actorFromJwt(user));
  }

  @Post('import-file')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', masterDataImportMulterOptions()))
  importFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportMasterDataFileDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
    @Req() req: MasterDataUploadRequest,
  ) {
    if (!file?.path) {
      throw new BadRequestException('Spreadsheet file is required');
    }
    const handlerStart = Date.now();
    const diskSaveMs = handlerStart - (req.masterDataUploadStartedAt ?? handlerStart);
    logMasterDataUploadSaved(this.logger, {
      fileName: file.originalname || 'upload.xlsx',
      fileSizeBytes: file.size,
      diskSaveMs,
      handlerMs: 0,
      memory: formatMemoryUsage(),
    });
    return this.masterDataService.importFromFile(
      file.path,
      file.originalname || 'upload.xlsx',
      dto.mode ?? 'replace',
      actorFromJwt(user),
    );
  }

  @Post('import-jobs')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', masterDataImportMulterOptions()))
  startImportJob(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportMasterDataFileDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
    @Req() req: MasterDataUploadRequest,
  ) {
    if (!file?.path) {
      throw new BadRequestException('Spreadsheet file is required');
    }

    const handlerStart = Date.now();
    const diskSaveMs = handlerStart - (req.masterDataUploadStartedAt ?? handlerStart);
    const fileName = file.originalname || 'upload.xlsx';

    logMasterDataUploadSaved(this.logger, {
      fileName,
      fileSizeBytes: file.size,
      diskSaveMs,
      handlerMs: Date.now() - handlerStart,
      memory: formatMemoryUsage(),
    });

    // Return immediately — Excel parse + MongoDB save run in the background.
    return this.masterDataService.queueImportFromFile(
      file.path,
      fileName,
      dto.mode ?? 'replace',
      actorFromJwt(user),
      { diskSaveMs, fileSizeBytes: file.size },
    );
  }

  @Get('import-jobs/:jobId')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getImportJob(@Param('jobId') jobId: string) {
    return this.masterDataService.getImportJobStatus(jobId);
  }

  @Get('current')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getCurrent(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.masterDataService.getCurrentForUser(user.id, user.roles ?? []);
  }

  @Get('preview')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getPreview(
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.getPreviewForUser(
      user.id,
      user.roles ?? [],
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 100,
    );
  }

  @Get('batch-coverage')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getBatchCoverage(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.masterDataService.getBatchCoverage(user.roles ?? []);
  }

  @Post('search')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  search(
    @Body() dto: SearchMasterDataDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.searchForUser(dto, user.id, user.roles ?? []);
  }

  /** Rebuild OpenSearch index from Mongo (source of truth). */
  @Post('search-index/reindex')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  reindexSearch(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.masterDataService.reindexSearchEngine(user.roles ?? []);
  }

  @Get('filter-schema')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getFilterSchema(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.masterDataService.getFilterSchema(user.roles ?? []);
  }

  @Get('column-options')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getColumnOptions(
    @Query() query: MasterDataColumnOptionsQueryDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.getColumnOptions(
      query.header,
      query.q,
      query.limit,
      user.roles ?? [],
    );
  }

  @Post('upload-requests')
  @Roles(SystemRole.DB_ADMIN)
  createUploadRequest(
    @Body() dto: CreateMasterDataUploadRequestDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.createUploadRequest(
      dto,
      actorFromJwt(user),
      user.roles ?? [],
    );
  }

  @Post('upload-requests/employee')
  @Roles(SystemRole.EMPLOYEE)
  createEmployeeUploadRequest(
    @Body() dto: CreateMasterDataUploadRequestDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.createEmployeeUploadRequest(
      dto,
      actorFromJwt(user),
      user.roles ?? [],
    );
  }

  @Get('upload-requests')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  listUploadRequests(@Query() query: ListMasterDataUploadRequestsDto) {
    return this.masterDataService.listUploadRequests(query);
  }

  @Get('upload-requests/employee/inbox')
  @Roles(SystemRole.DB_ADMIN, SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  listEmployeeUploadRequestsForDbAdmin(@Query() query: ListMasterDataUploadRequestsDto) {
    return this.masterDataService.listEmployeeUploadRequestsForDbAdmin(query);
  }

  @Get('upload-requests/my')
  @Roles(SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  listMyUploadRequests(
    @Query() query: ListMasterDataUploadRequestsDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.listMyUploadRequests(user.id, query);
  }

  @Get('upload-requests/:requestId')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  getUploadRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.getUploadRequest(
      requestId,
      user.id,
      user.roles ?? [],
    );
  }

  @Post('upload-requests/:requestId/db-review')
  @Roles(SystemRole.DB_ADMIN)
  reviewEmployeeUploadByDbAdmin(
    @Param('requestId') requestId: string,
    @Body() dto: DbReviewEmployeeUploadDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.reviewEmployeeUploadByDbAdmin(
      requestId,
      dto,
      actorFromJwt(user),
    );
  }

  @Post('upload-requests/:requestId/work')
  @Roles(SystemRole.EMPLOYEE)
  updateEmployeeWorkData(
    @Param('requestId') requestId: string,
    @Body() dto: UpdateEmployeeWorkDataDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.updateEmployeeWorkData(
      requestId,
      dto,
      actorFromJwt(user),
    );
  }

  @Post('upload-requests/:requestId/forward')
  @Roles(SystemRole.DB_ADMIN)
  forwardEmployeeRequestToAdmin(
    @Param('requestId') requestId: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.forwardEmployeeRequestToAdmin(
      requestId,
      actorFromJwt(user),
    );
  }

  @Post('upload-requests/:requestId/review')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  reviewUploadRequest(
    @Param('requestId') requestId: string,
    @Body() dto: ReviewMasterDataUploadRequestDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.reviewUploadRequest(
      requestId,
      dto,
      actorFromJwt(user),
    );
  }

  @Delete('upload-requests/:requestId')
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  deleteUploadRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.deleteUploadRequest(requestId, actorFromJwt(user));
  }

  @Delete('current')
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  clear(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.masterDataService.clear(actorFromJwt(user));
  }
}
