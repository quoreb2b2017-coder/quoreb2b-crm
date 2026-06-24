import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { QcService } from './qc.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { QcListQueryDto, QcMergeDto, QcRejectDto } from './dto/qc.dto';

interface JwtUser {
  id: string;
  sub?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
}

@Controller({ path: 'qc', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcController {
  constructor(private qcService: QcService) {}

  @Get('my')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN)
  getMy(@CurrentUser() user: JwtUser, @Query() query: QcListQueryDto) {
    return this.qcService.getMyEntries(user.id ?? user.sub!, query);
  }

  @Get('my/tree')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN)
  getMyTree(@CurrentUser() user: JwtUser) {
    return this.qcService.getMyTree(user.id ?? user.sub!);
  }

  @Get('my/count')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN)
  getMyCount(@CurrentUser() user: JwtUser) {
    return this.qcService.pendingCountForEmployee(user.id ?? user.sub!);
  }

  @Get('all')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getAll(@CurrentUser() user: JwtUser, @Query() query: QcListQueryDto) {
    return this.qcService.getAllEntries(user.id ?? user.sub!, user.roles ?? [], query);
  }

  @Get('all/tree')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getAllTree(@CurrentUser() user: JwtUser) {
    return this.qcService.getAllTree(user.roles ?? []);
  }

  @Get('all/count')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getAllCount() {
    return this.qcService.pendingCountForAdmin();
  }

  @Post('merge')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  merge(@Body() dto: QcMergeDto, @CurrentUser() user: JwtUser) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    return this.qcService.mergeToReady(
      { id: user.id ?? user.sub!, email: user.email, name },
      user.roles ?? [],
      dto,
    );
  }

  @Post('reject')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  reject(@Body() dto: QcRejectDto, @CurrentUser() user: JwtUser) {
    return this.qcService.rejectEntries(user.roles ?? [], dto.entryIds);
  }

  @Get('ready')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  listReady(@CurrentUser() user: JwtUser, @Query() query: QcListQueryDto) {
    return this.qcService.listReadyBatches(user.roles ?? [], query);
  }

  @Get('ready/tree')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  readyTree(@CurrentUser() user: JwtUser) {
    return this.qcService.getReadyTree(user.roles ?? []);
  }

  @Get('ready/:batchId')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getReadyBatch(@CurrentUser() user: JwtUser, @Param('batchId') batchId: string) {
    return this.qcService.getReadyBatch(user.roles ?? [], batchId);
  }
}
