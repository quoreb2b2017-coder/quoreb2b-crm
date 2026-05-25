import { Controller, Post, Get, Body, Query, UseGuards, Req, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AttendanceService } from './attendance.service';
import { AttendanceSchedulerService } from './attendance-scheduler.service';
import { Attendance } from './schemas/attendance.schema';
import { MarkAttendanceDto, AttendanceQueryDto, AttendanceAnalyticsDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { parseDateOnly, toDateKey } from './attendance-date.util';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(
    private attendanceService: AttendanceService,
    private schedulerService: AttendanceSchedulerService,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
  ) {}

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
      const today = new Date();
      const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
      const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const istDate = new Date(istTime);
      const dayOfWeek = istDate.getDay();
      const dayName = dayOfWeek === 0 ? 'Sunday' : dayOfWeek === 6 ? 'Saturday' : 'Weekday';

      const users = await this.getUserIds();
      const totalUsers = await this.attendanceModel.collection.db
        .collection('users')
        .countDocuments({});

      const activeUsers = await this.attendanceModel.collection.db
        .collection('users')
        .countDocuments({ isActive: true });

      const todayRecords = await this.attendanceModel.countDocuments({
        date: {
          $gte: new Date(istTime.split(' ')[0] + 'T00:00:00Z'),
          $lte: new Date(istTime.split(' ')[0] + 'T23:59:59Z'),
        },
      });

      return {
        success: true,
        debug: {
          istTime,
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
