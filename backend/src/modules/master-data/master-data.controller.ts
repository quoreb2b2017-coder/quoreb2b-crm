import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import { SaveMasterDataDto } from './dto/save-master-data.dto';
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
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getCurrent() {
    return this.masterDataService.getCurrent();
  }

  @Get('batch-coverage')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getBatchCoverage() {
    return this.masterDataService.getBatchCoverage();
  }

  @Delete('current')
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  clear(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.masterDataService.clear(actorFromJwt(user));
  }
}
