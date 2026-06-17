import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import { SaveMasterDataDto } from './dto/save-master-data.dto';
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

@Controller({ path: 'master-data', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class MasterDataController {
  constructor(private masterDataService: MasterDataService) {}

  @Post()
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  save(
    @Body() dto: SaveMasterDataDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.masterDataService.save(dto, actorFromJwt(user));
  }

  @Get('current')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getCurrent(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.masterDataService.getCurrentForUser(user.id, user.roles ?? []);
  }

  @Get('batch-coverage')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getBatchCoverage() {
    return this.masterDataService.getBatchCoverage();
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
  @Roles(SystemRole.DB_ADMIN)
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
