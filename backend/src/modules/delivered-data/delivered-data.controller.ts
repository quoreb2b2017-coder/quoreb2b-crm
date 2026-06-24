import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SuppressionDataService } from './delivered-data.service';
import { CreateSuppressionCampaignDto } from './dto/create-suppression-campaign.dto';
import { UploadSuppressionCampaignDto } from './dto/upload-suppression-campaign.dto';
import { CheckSuppressionDto } from './dto/check-suppression.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { actorFromJwt } from '../activity-logs/activity-user.util';

@Controller({ path: 'suppression-data', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppressionDataController {
  constructor(private suppressionDataService: SuppressionDataService) {}

  @Get('campaigns')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.DB_ADMIN)
  listCampaigns() {
    return this.suppressionDataService.listSuppressionCampaigns();
  }

  @Post('campaigns')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  createCampaign(
    @Body() dto: CreateSuppressionCampaignDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.suppressionDataService.createCampaign(dto, actorFromJwt(user));
  }

  @Post('campaigns/:campaignId/upload')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  uploadToCampaign(
    @Param('campaignId') campaignId: string,
    @Body() dto: UploadSuppressionCampaignDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.suppressionDataService.uploadToCampaign(
      campaignId,
      dto,
      actorFromJwt(user),
    );
  }

  @Post('check')
  @Roles(
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
  )
  checkSuppression(
    @Body() dto: CheckSuppressionDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.suppressionDataService.checkSuppression(
      dto,
      actorFromJwt(user),
      user.roles ?? [],
    );
  }

  @Get('separation-batches')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  listSeparationBatches() {
    return this.suppressionDataService.listSeparationBatches();
  }
}

/** Legacy route alias */
@Controller({ path: 'delivered-data', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveredDataController extends SuppressionDataController {}
