import { Controller, Post, Get, Body, Query, UseGuards, Req, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AttendanceService } from './attendance.service';
import { AttendanceSchedulerService } from './attendance-scheduler.service';
import { Attendance } from './schemas/attendance.schema';
import { MarkAttendanceDto, AttendanceQueryDto, AttendanceAnalyticsDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WORKSPACE_TIMEZONE, WORKSPACE_TIMEZONE_LABEL } from '../../common/constants/workspace-timezone.constant';
import { calendarDateKey } from '../../common/utils/timezone.util';
import { isWeekendDateKey, parseDateOnly, toDateKey } from './attendance-date.util';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(
    private attendanceService: AttendanceService,
    private schedulerService: AttendanceSchedulerService,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
  ) {}

  @Post('mark')
  async markAttendance(
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() user: { id: string; roles?: string[] },
  ) {
    this.attendanceService.assertCanMarkForUser(user.id, user.roles ?? [], dto.userId);
    if (dto.status === 'holiday') {
      this.attendanceService.assertCanMarkHoliday(user.roles ?? []);
    }
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
  async getYearlyAnalytics(
    @Query('userId') userId: string,
    @Query('year') year?: number,
    @Query('refresh') _refresh?: string,
  ) {
    const targetYear = year != null && !Number.isNaN(Number(year)) ? Number(year) : undefined;
    return this.attendanceService.getYearlyAttendanceAnalytics(userId, targetYear, !!_refresh);
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

  /**
   * Manual trigger to auto-mark weekends for today
   * Only works if today is Saturday or Sunday
   */
  @Post('auto-mark-weekends')
  async triggerAutoMarkWeekends() {
    await this.schedulerService.autoMarkWeekends();
    return {
      success: true,
      message: 'Weekend auto-mark triggered successfully',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * TEST ENDPOINT - Immediately marks all employees as weekend
   * Use this for testing on any day
   */
  @Post('test/mark-weekend-now')
  async testMarkWeekendNow() {
    try {
      const dateKey = calendarDateKey(new Date());

      if (!isWeekendDateKey(dateKey)) {
        return {
          success: false,
          message: `Today (${dateKey}) is not Saturday or Sunday in ${WORKSPACE_TIMEZONE_LABEL}`,
        };
      }

      const users = await this.getUserIds();

      if (users.length === 0) {
        return {
          success: false,
          message: 'No users found',
        };
      }

      const normalizedDate = parseDateOnly(dateKey);

      const bulkOps = users.map((userId) => ({
        updateOne: {
          filter: {
            userId: new Types.ObjectId(userId),
            date: normalizedDate,
          },
          update: {
            $set: {
              status: 'weekend',
              hoursWorked: 0,
              notes: 'Test: Auto-marked weekend',
            },
            $setOnInsert: {
              userId: new Types.ObjectId(userId),
              date: normalizedDate,
              isApproved: true,
              isPaidLeave: false,
            },
          },
          upsert: true,
        },
      }));

      const result = await this.attendanceModel.bulkWrite(bulkOps);

      return {
        success: true,
        message: `✅ Test: Marked ${result.upsertedCount + result.modifiedCount} employees as weekend for ${dateKey}`,
        date: dateKey,
        usersMarked: users.length,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Error: ${error.message}`,
        error: error.toString(),
      };
    }
  }

  /**
   * DEBUG ENDPOINT - Check system status
   */
  @Get('debug/status')
  async debugStatus() {
    try {
      const easternTime = new Date().toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE });
      const dayShort = new Intl.DateTimeFormat('en-US', {
        timeZone: WORKSPACE_TIMEZONE,
        weekday: 'short',
      }).format(new Date());
      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const dayOfWeek = dayMap[dayShort] ?? new Date().getDay();
      const dayName = dayOfWeek === 0 ? 'Sunday' : dayOfWeek === 6 ? 'Saturday' : 'Weekday';

      const users = await this.getUserIds();
      const totalUsers = await this.attendanceModel.collection.db
        .collection('users')
        .countDocuments({});

      const activeUsers = await this.attendanceModel.collection.db
        .collection('users')
        .countDocuments({ isActive: true });

      const todayKey = calendarDateKey(new Date());
      const todayDate = parseDateOnly(todayKey);
      const todayRecords = await this.attendanceModel.countDocuments({
        date: todayDate,
      });

      return {
        success: true,
        debug: {
          easternTime,
          timezone: WORKSPACE_TIMEZONE_LABEL,
          dayOfWeek,
          dayName,
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
          users: {
            total: totalUsers,
            active: activeUsers,
            fetched: users.length,
          },
          todayRecords,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get all active user IDs (helper for test endpoint)
   */
  private async getUserIds(): Promise<string[]> {
    try {
      // Try active users first
      let users = await this.attendanceModel.collection.db
        .collection('users')
        .find({ isActive: true })
        .project({ _id: 1 })
        .toArray();

      if (users.length > 0) {
        return users.map((u) => u._id.toString());
      }

      // If no active users, get all users
      users = await this.attendanceModel.collection.db
        .collection('users')
        .find({})
        .project({ _id: 1 })
        .limit(100)
        .toArray();

      return users.map((u) => u._id.toString());
    } catch (error) {
      console.error('Error fetching user IDs:', error);
      return [];
    }
  }
}
