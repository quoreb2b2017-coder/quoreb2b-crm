import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogsQueryDto } from './dto/activity-logs-query.dto';
import { TrackActivityDto } from './dto/track-activity.dto';
import { DailyReportQueryDto, MonthlyReportQueryDto } from './dto/employee-report-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';

function extractUserAgent(req: Request) {
  return (req.headers['user-agent'] as string) || 'unknown';
}

@Controller({ path: 'activity-logs', version: '1' })
export class ActivityLogsController {
  constructor(private activityLogsService: ActivityLogsService) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
    SystemRole.CLIENT,
  )
  track(
    @Body() dto: TrackActivityDto,
    @CurrentUser()
    user: {
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      employeeId?: string;
      roles?: string[];
      sessionId?: string;
    },
    @Req() req: Request,
  ) {
    return this.activityLogsService.track(dto, {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      roles: user.roles,
      sessionId: user.sessionId,
      userAgent: extractUserAgent(req),
    });
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  getStats(
    @Query() dto: ActivityLogsQueryDto,
    @CurrentUser() user: { id: string; roles?: string[] },
  ) {
    const canViewAll =
      user.roles?.includes(SystemRole.SUPER_ADMIN) ||
      user.roles?.includes(SystemRole.ADMIN);
    if (!canViewAll) {
      dto.userId = user.id;
    }
    return this.activityLogsService.getActivityStats(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN, SystemRole.EMPLOYEE)
  findAll(
    @Query() dto: ActivityLogsQueryDto,
    @CurrentUser() user: { id: string; roles?: string[] },
  ) {
    const canViewAll =
      user.roles?.includes(SystemRole.SUPER_ADMIN) ||
      user.roles?.includes(SystemRole.ADMIN);
    if (!canViewAll) {
      dto.userId = user.id;
    }
    return this.activityLogsService.findAll(dto);
  }

  @Get('user/:userId/report/daily')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getDailyReport(@Param('userId') userId: string, @Query() query: DailyReportQueryDto) {
    return this.activityLogsService.getDailyReport(userId, query.date);
  }

  @Get('user/:userId/report/monthly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getMonthlyReport(@Param('userId') userId: string, @Query() query: MonthlyReportQueryDto) {
    return this.activityLogsService.getMonthlyReport(userId, query.year, query.month);
  }

  @Get('work-time/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
  )
  getMyWorkTime(
    @CurrentUser() user: { id: string; sessionId?: string },
  ) {
    return this.activityLogsService.getMyWorkTime(user.id, user.sessionId);
  }

  @Get('work-time/team')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  getTeamWorkTime(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('userIds') userIds: string,
  ) {
    const ids = (userIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.activityLogsService.getTeamWorkTime(
      ids,
      parseInt(year, 10),
      parseInt(month, 10),
    );
  }

  @Get('user/:userId/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  findSessionsByUser(@Param('userId') userId: string) {
    return this.activityLogsService.findSessionsByUser(userId);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  findByUser(@Param('userId') userId: string) {
    return this.activityLogsService.findByUser(userId);
  }
}
