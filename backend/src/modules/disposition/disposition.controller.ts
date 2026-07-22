import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DispositionService } from './disposition.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import {
  CreateCallbackReminderDto,
  DeleteDispositionCampaignDto,
  DispositionListQueryDto,
} from './dto/disposition.dto';

interface JwtUser {
  id?: string;
  sub?: string;
  roles?: string[];
  firstName?: string;
  lastName?: string;
  name?: string;
}

@Controller({ path: 'disposition', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispositionController {
  constructor(private dispositionService: DispositionService) {}

  private uid(user: JwtUser): string {
    return user.id ?? user.sub ?? '';
  }

  private displayName(user: JwtUser): string | undefined {
    const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return full || user.name || undefined;
  }

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

  @Post('campaign/delete')
  @Roles(SystemRole.SUPER_ADMIN)
  deleteCampaign(
    @CurrentUser() user: JwtUser,
    @Body() dto: DeleteDispositionCampaignDto,
  ) {
    return this.dispositionService.deleteCampaignArchive(user.roles ?? [], dto);
  }

  @Post('callback-reminders')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN, SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  createCallback(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateCallbackReminderDto,
  ) {
    return this.dispositionService.createCallbackReminder(
      this.uid(user),
      this.displayName(user),
      dto,
    );
  }

  @Get('callback-reminders/due')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN, SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  dueReminders(@CurrentUser() user: JwtUser) {
    return this.dispositionService.listDueReminders(this.uid(user));
  }

  @Get('callback-reminders/mine')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN, SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  myReminders(@CurrentUser() user: JwtUser) {
    return this.dispositionService.listMyReminders(this.uid(user));
  }

  @Post('callback-reminders/:id/dismiss')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN, SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  dismiss(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.dispositionService.dismissReminder(this.uid(user), id);
  }
}
