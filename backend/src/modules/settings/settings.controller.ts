import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SystemRole } from '../../common/constants/roles.constant';

@Controller({ path: 'settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get(':key')
  get(@Param('key') key: string) {
    return this.settingsService.get(key);
  }

  @Put(':key')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  set(@Param('key') key: string, @Body() body: { value: unknown; group?: string }) {
    return this.settingsService.set(key, body.value, body.group);
  }
}
