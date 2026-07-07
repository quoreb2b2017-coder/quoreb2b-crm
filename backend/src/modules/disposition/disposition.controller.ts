import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DispositionService } from './disposition.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { DispositionListQueryDto } from './dto/disposition.dto';

interface JwtUser {
  id: string;
  sub?: string;
  roles?: string[];
}

@Controller({ path: 'disposition', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispositionController {
  constructor(private dispositionService: DispositionService) {}

  @Get('all')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getAll(@CurrentUser() user: JwtUser, @Query() query: DispositionListQueryDto) {
    return this.dispositionService.getAllEntries(user.roles ?? [], query);
  }

  @Get('all/tree')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getAllTree(@CurrentUser() user: JwtUser) {
    return this.dispositionService.getAllTree(user.roles ?? []);
  }
}
