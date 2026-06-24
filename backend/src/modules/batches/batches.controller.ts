import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { BatchHierarchyService } from './batch-hierarchy.service';
import { CreateBatchDto, ShareBatchDto, UpdateBatchDto } from './dto/batch.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { actorFromJwt } from '../activity-logs/activity-user.util';

interface JwtUser {
  id: string;
  sub?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
}

@Controller({ path: 'batches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchesController {
  constructor(
    private batchesService: BatchesService,
    private batchHierarchy: BatchHierarchyService,
  ) {}

  @Post()
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  create(@Body() dto: CreateBatchDto, @CurrentUser() user: JwtUser) {
    return this.batchesService.create(
      dto,
      {
        id: user.id ?? user.sub!,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      },
      user.roles ?? [],
    );
  }

  @Get()
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  findAll(@CurrentUser() user: JwtUser) {
    return this.batchesService.findAll(user.id ?? user.sub!, user.roles ?? []);
  }

  @Get('suppression-campaigns')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  listSuppressionCampaigns() {
    return this.batchesService.listSuppressionBatchesForAdmin();
  }

  @Get(':id/hierarchy')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getHierarchy(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.batchHierarchy.getHierarchy(
      id,
      user.id ?? user.sub!,
      user.roles ?? [],
    );
  }

  @Get(':id/hierarchy/members/:userId/performance')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getMemberPerformance(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.batchHierarchy.getMemberPerformance(
      id,
      userId,
      user.id ?? user.sub!,
      user.roles ?? [],
    );
  }

  @Get(':id/hierarchy/members/:userId/actions')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getMemberActions(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.batchHierarchy.getMemberActions(
      id,
      userId,
      user.id ?? user.sub!,
      user.roles ?? [],
    );
  }

  @Get(':id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.batchesService.findOne(id, user.id ?? user.sub!, user.roles ?? []);
  }

  @Patch(':id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  update(@Param('id') id: string, @Body() dto: UpdateBatchDto, @CurrentUser() user: JwtUser) {
    return this.batchesService.update(
      id,
      dto,
      user.id ?? user.sub!,
      actorFromJwt(user),
      user.roles ?? [],
    );
  }

  @Post(':id/share')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  share(@Param('id') id: string, @Body() dto: ShareBatchDto, @CurrentUser() user: JwtUser) {
    return this.batchesService.share(id, dto, user.id ?? user.sub!, user.roles ?? []);
  }

  @Delete(':id/share/:userId')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  unshare(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: JwtUser) {
    return this.batchesService.unshare(id, userId, user.id ?? user.sub!, user.roles ?? []);
  }

  @Delete(':id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  delete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.batchesService.delete(id, user.id ?? user.sub!, user.roles ?? []);
  }
}
