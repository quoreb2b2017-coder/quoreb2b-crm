import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';

@Controller({ path: 'analytics', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles(SystemRole.SUPER_ADMIN)
  getDashboard() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('db-admin-dashboard')
  @Roles(SystemRole.DB_ADMIN)
  getDbAdminDashboard(@CurrentUser() user: { id: string; sub?: string }) {
    return this.analyticsService.getDbAdminDashboard(user.id ?? user.sub!);
  }

  @Get('employee-dashboard')
  @Roles(SystemRole.EMPLOYEE)
  getEmployeeDashboard(@CurrentUser() user: { id: string; sub?: string }) {
    return this.analyticsService.getEmployeeDashboard(user.id ?? user.sub!);
  }

  @Get('charts')
  @Roles(SystemRole.SUPER_ADMIN)
  getCharts() {
    return this.analyticsService.getChartData();
  }

  @Get('recent-activity')
  @Roles(SystemRole.SUPER_ADMIN)
  getRecentActivity(@Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : 12;
    return this.analyticsService.getRecentWorkActivity(
      Number.isFinite(parsed) ? parsed : 12,
    );
  }

  @Get('search/leads')
  searchLeads(@Query('q') query: string) {
    return this.analyticsService.searchLeads(query);
  }
}
