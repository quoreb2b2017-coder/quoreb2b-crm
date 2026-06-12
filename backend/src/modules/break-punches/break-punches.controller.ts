import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { BreakPunchesService } from './break-punches.service';
import { ToggleBreakPunchDto } from './dto/break-punch.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';

@Controller({ path: 'break-punches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BreakPunchesController {
  constructor(private readonly breakPunchesService: BreakPunchesService) {}

  private userId(user: { id?: string; sub?: string }): string {
    return user.id ?? user.sub ?? '';
  }

  @Get('today')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
  )
  getToday(@CurrentUser() user: { id?: string; sub?: string }) {
    return this.breakPunchesService.getToday(this.userId(user));
  }

  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
  )
  toggle(
    @CurrentUser() user: { id?: string; sub?: string },
    @Body() dto: ToggleBreakPunchDto,
  ) {
    return this.breakPunchesService.toggle(this.userId(user), dto.type);
  }
}
