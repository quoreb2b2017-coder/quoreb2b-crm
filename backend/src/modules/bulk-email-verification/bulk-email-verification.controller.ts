import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { BulkEmailVerificationService } from './bulk-email-verification.service';
import { CreateEmailVerificationBatchDto } from './dto/create-batch.dto';
import { ListEmailVerificationRecordsDto } from './dto/list-records.dto';
import { ListEmailVerificationProspectsDto } from './dto/list-prospects.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { actorFromJwt } from '../activity-logs/activity-user.util';

@Controller({ path: 'bulk-email-verification', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SystemRole.DB_ADMIN, SystemRole.SUPER_ADMIN)
export class BulkEmailVerificationController {
  constructor(private readonly service: BulkEmailVerificationService) {}

  @Post('batches')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createBatch(
    @Body() dto: CreateEmailVerificationBatchDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.createBatch(dto, actorFromJwt(user));
  }

  @Get('batches')
  listBatches(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.service.listBatches(actorFromJwt(user));
  }

  @Get('analytics')
  getAnalytics(@CurrentUser() user: Parameters<typeof actorFromJwt>[0]) {
    return this.service.getAnalytics(actorFromJwt(user));
  }

  @Get('smtp-health')
  getSmtpHealth() {
    return this.service.getSmtpHealth();
  }

  @Get('batches/:id/diagnostics')
  getBatchDiagnostics(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.getBatchDiagnostics(id, actorFromJwt(user));
  }

  @Get('batches/:id')
  getBatch(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.getBatch(id, actorFromJwt(user));
  }

  @Post('batches/:id/verify')
  startVerification(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.startVerification(id, actorFromJwt(user));
  }

  @Post('batches/:id/retry')
  retryBatch(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.retryBatch(id, actorFromJwt(user));
  }

  @Post('batches/:id/reset')
  resetBatch(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.resetBatch(id, actorFromJwt(user));
  }

  @Delete('batches/:id')
  deleteBatch(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.deleteBatch(id, actorFromJwt(user));
  }

  @Get('batches/:id/prospects')
  listProspects(
    @Param('id') id: string,
    @Query() query: ListEmailVerificationProspectsDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.listProspects(id, query, actorFromJwt(user));
  }

  @Get('batches/:id/records')
  listRecords(
    @Param('id') id: string,
    @Query() query: ListEmailVerificationRecordsDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.service.listRecords(id, query, actorFromJwt(user));
  }

  @Get('batches/:id/export/passed')
  @Header('Content-Type', 'text/csv')
  async exportPassedEmails(
    @Param('id') id: string,
    @Query('minScore') minScore: string | undefined,
    @Query('strict') strict: string | undefined,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
    @Res() res: Response,
  ) {
    const score = minScore != null ? parseInt(minScore, 10) : 95;
    const result = await this.service.exportPassedEmails(
      id,
      actorFromJwt(user),
      Number.isFinite(score) ? score : 95,
      strict !== 'false',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.send(result.csv);
  }

  @Get('batches/:id/export')
  @Roles(SystemRole.SUPER_ADMIN)
  @Header('Content-Type', 'text/csv')
  async exportRecords(
    @Param('id') id: string,
    @Query() query: ListEmailVerificationRecordsDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
    @Res() res: Response,
  ) {
    const result = await this.service.exportRecords(id, query, actorFromJwt(user));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.send(result.csv);
  }
}
