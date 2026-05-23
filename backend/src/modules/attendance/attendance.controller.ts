import { Controller, Post, Get, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, AttendanceQueryDto, AttendanceAnalyticsDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post('mark')
  async markAttendance(@Body() dto: MarkAttendanceDto) {
    return this.attendanceService.markAttendance(dto);
  }

  @Get('records')
  async getAttendanceRecords(@Query() query: AttendanceQueryDto) {
    return this.attendanceService.getAttendanceRecords(query);
  }

  @Get('analytics/monthly')
  async getMonthlyAnalytics(@Query() query: AttendanceAnalyticsDto) {
    return this.attendanceService.getAttendanceAnalytics(query);
  }

  @Get('analytics/yearly')
  async getYearlyAnalytics(@Query('userId') userId: string, @Query('year') year?: number) {
    return this.attendanceService.getYearlyAttendanceAnalytics(userId, year);
  }

  @Get('analytics/team')
  async getTeamAnalytics(
    @Query('userIds') userIds: string,
    @Query('month') month?: number,
    @Query('year') year?: number,
  ) {
    const ids = userIds.split(',');
    return this.attendanceService.getUsersAttendanceAnalytics(ids, month, year);
  }
}
