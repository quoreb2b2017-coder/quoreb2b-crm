import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WORKSPACE_TIMEZONE,
  WORKSPACE_TIMEZONE_LABEL,
} from '../../common/constants/workspace-timezone.constant';
import { calendarDateKey } from '../../common/utils/timezone.util';
import { Attendance } from './schemas/attendance.schema';
import { parseDateOnly, isWeekend } from './attendance-date.util';

@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);

  constructor(@InjectModel(Attendance.name) private attendanceModel: Model<Attendance>) {}

  /**
   * Run every Saturday and Sunday at 4:30 PM US Eastern.
   * Cron: 30 16 * * 0,6 — 0 = Sunday, 6 = Saturday
   */
  @Cron('30 16 * * 0,6', { timeZone: WORKSPACE_TIMEZONE })
  async autoMarkWeekends() {
    try {
      this.logger.log(
        `🚀 Starting auto-mark weekends job at 4:30 PM ${WORKSPACE_TIMEZONE_LABEL}…`,
      );

      const easternTime = new Date().toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE });
      this.logger.log(`⏰ Current ${WORKSPACE_TIMEZONE_LABEL}: ${easternTime}`);

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
      const dayName =
        dayOfWeek === 0 ? 'Sunday' : dayOfWeek === 6 ? 'Saturday' : 'Unknown';

      this.logger.log(`📅 Today is ${dayName} (Day ${dayOfWeek})`);

      if (!isWeekend(dayOfWeek)) {
        this.logger.log('⏭️ Today is not a weekend, skipping auto-mark');
        return;
      }

      const dateKey = calendarDateKey(new Date());
      this.logger.log(`📆 Processing date: ${dateKey}`);

      const normalizedDate = parseDateOnly(dateKey);

      const users = await this.getUserIds();
      this.logger.log(`👥 Found ${users.length} active users`);

      if (users.length === 0) {
        this.logger.log('⚠️ No users found - checking database...');
        const totalUsers = await this.attendanceModel.collection.db
          .collection('users')
          .countDocuments({});
        this.logger.log(`📊 Total users in database: ${totalUsers}`);
        return;
      }

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
              notes: 'Auto-marked weekend',
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

      this.logger.log(`📝 Preparing to mark ${bulkOps.length} records…`);

      const result = await this.attendanceModel.bulkWrite(bulkOps);

      const totalMarked = result.upsertedCount + result.modifiedCount;
      this.logger.log(
        `✅ Successfully auto-marked ${totalMarked} weekend records for ${users.length} users at 4:30 PM ${WORKSPACE_TIMEZONE_LABEL}`,
      );
      this.logger.log(`📊 Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
    } catch (error) {
      this.logger.error('❌ Error in autoMarkWeekends:', error);
    }
  }

  private async getUserIds(): Promise<string[]> {
    try {
      this.logger.log('🔍 Fetching active users...');

      let users = await this.attendanceModel.collection.db
        .collection('users')
        .find({ isActive: true })
        .project({ _id: 1 })
        .toArray();

      if (users.length > 0) {
        this.logger.log(`✅ Found ${users.length} users with isActive: true`);
        return users.map((u) => u._id.toString());
      }

      this.logger.log('⚠️ No active users found, trying to find all users...');
      users = await this.attendanceModel.collection.db
        .collection('users')
        .find({})
        .project({ _id: 1 })
        .limit(100)
        .toArray();

      if (users.length > 0) {
        this.logger.log(`✅ Found ${users.length} total users`);
        return users.map((u) => u._id.toString());
      }

      this.logger.log('❌ No users found in database');
      return [];
    } catch (error) {
      this.logger.error('❌ Error fetching user IDs:', error);
      return [];
    }
  }

  async testMarkWeekendManual(): Promise<any> {
    this.logger.log('🧪 Manual test triggered...');
    return this.autoMarkWeekends();
  }
}
