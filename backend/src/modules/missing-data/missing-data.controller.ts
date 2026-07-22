import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { MissingDataService } from './missing-data.service';

interface JwtUser {
  id?: string;
  sub?: string;
  roles?: string[];
}

@Controller({ path: 'missing-data', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class MissingDataController {
  constructor(private readonly missingData: MissingDataService) {}

  private uid(user: JwtUser): string {
    return user.id ?? user.sub ?? '';
  }

  @Get('tree')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.DB_ADMIN,
    SystemRole.EMPLOYEE,
  )
  getTree(@CurrentUser() user: JwtUser) {
    return this.missingData.getTree(this.uid(user), user.roles ?? []);
  }

  @Get('files')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.DB_ADMIN,
    SystemRole.EMPLOYEE,
  )
  listFiles(
    @CurrentUser() user: JwtUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.missingData.listFiles(this.uid(user), user.roles ?? [], {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Get('files/:id')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.DB_ADMIN,
    SystemRole.EMPLOYEE,
  )
  getFile(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('full') full?: string,
  ) {
    const isFull = full === 'true' || full === '1';
    return this.missingData.getFile(id, this.uid(user), user.roles ?? [], {
      offset: offset !== undefined ? Number(offset) : 0,
      limit: limit !== undefined ? Number(limit) : 100,
      full: isFull,
    });
  }

  @Delete('files/:id')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.DB_ADMIN,
    SystemRole.EMPLOYEE,
  )
  deleteFile(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.missingData.deleteFile(id, this.uid(user), user.roles ?? []);
  }

  @Post('backfill')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.DB_ADMIN,
    SystemRole.EMPLOYEE,
  )
  backfill(@CurrentUser() user: JwtUser) {
    return this.missingData.backfill(this.uid(user), user.roles ?? []);
  }

  @Post('purge-master')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  purgeMaster() {
    return this.missingData.purgeIncompleteFromMaster();
  }

  @Post('realign-periods')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  realignPeriods() {
    return this.missingData.realignMissingDataPeriods();
  }

  @Post('consolidate')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  consolidate() {
    return this.missingData.consolidateMissingDataFiles();
  }
}
