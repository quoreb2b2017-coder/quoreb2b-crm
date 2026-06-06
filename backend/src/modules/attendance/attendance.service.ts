import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance } from './schemas/attendance.schema';
import { MarkAttendanceDto, AttendanceQueryDto, AttendanceAnalyticsDto } from './dto/attendance.dto';
import { User } from '../users/schemas/user.schema';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { ConfigService } from '@nestjs/config';
import { cacheTtlSeconds, stableHash } from '../../redis/cache.util';
import {
  combineDateAndTime,
  monthRangeUtc,
  parseDateOnly,
  toDateKey,
  isWeekend,
} from './attendance-date.util';
import {
  currentTimeHHmm,
  formatStoredTime,
  formatTime12h,
  isLateCheckIn,
  isTodayDateKey,
} from './attendance-late.util';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    @InjectModel(User.name) private userModel: Model<User>,
    private notifications: NotificationTriggerService,
    private cache: AppCacheService,
    private config: ConfigService,
  ) {}

  async markAttendance(dto: MarkAttendanceDto) {
    const normalizedDate = parseDateOnly(dto.date);
    const dayOfWeek = normalizedDate.getUTCDay();
    
    // Auto-mark Saturday (6) and Sunday (0) as weekend
    let status = dto.status;
    if (isWeekend(dayOfWeek)) {
      status = 'weekend';
    }

    let checkInTime: Date | undefined;
    let checkOutTime: Date | undefined;
    let resolvedCheckInHHmm: string | undefined;
    let isLate = false;

    if (dto.checkInTime) {
      resolvedCheckInHHmm = dto.checkInTime;
      checkInTime = combineDateAndTime(dto.date, dto.checkInTime);
    } else if (
      (status === 'present' || status === 'half-day') &&
      !isWeekend(dayOfWeek) &&
      isTodayDateKey(dto.date)
    ) {
      resolvedCheckInHHmm = currentTimeHHmm();
      checkInTime = combineDateAndTime(dto.date, resolvedCheckInHHmm);
    }

    if (resolvedCheckInHHmm && (status === 'present' || status === 'half-day')) {
      isLate = isLateCheckIn(resolvedCheckInHHmm);
    }

    if (dto.checkOutTime) {
      checkOutTime = combineDateAndTime(dto.date, dto.checkOutTime);
      if (checkOutTime <= (checkInTime ?? checkOutTime)) {
        checkOutTime = new Date(checkOutTime.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const hoursWorked =
      dto.hoursWorked ??
      (checkInTime && checkOutTime
        ? Math.max(0, (checkOutTime.getTime() - checkInTime.getTime()) / 3600000)
        : 0);

    const record = await this.attendanceModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(dto.userId),
        date: normalizedDate,
      },
      {
        $set: {
          status,
          checkInTime,
          checkOutTime,
          hoursWorked: Math.round(hoursWorked * 100) / 100,
          notes: dto.notes,
          isPaidLeave: status === 'leave' ? (dto.isPaidLeave ?? false) : false,
          isLate,
        },
      },
      { upsert: true, new: true },
    );
    const user = await this.userModel.findById(dto.userId).lean().exec();
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'Employee';
    try {
      await this.notifications.notifyAttendanceMarked(
        dto.userId,
        userName,
        dto.date,
        status,
        resolvedCheckInHHmm ? formatTime12h(resolvedCheckInHHmm) : undefined,
        isLate,
      );
    } catch {
      /* notification should not block attendance marking */
    }
    return record;
  }

  async getAttendanceRecords(dto: AttendanceQueryDto) {
    const query: Record<string, unknown> = {};

    if (dto.userId) {
      query.userId = new Types.ObjectId(dto.userId);
    }

    if (dto.startDate || dto.endDate) {
      query.date = {};
      if (dto.startDate) {
        (query.date as Record<string, Date>).$gte = parseDateOnly(
          dto.startDate.slice(0, 10),
        );
      }
      if (dto.endDate) {
        const end = parseDateOnly(dto.endDate.slice(0, 10));
        end.setUTCHours(23, 59, 59, 999);
        (query.date as Record<string, Date>).$lte = end;
      }
    }

    if (dto.status) {
      query.status = dto.status;
    }

    const page = dto.page || 1;
    const limit = dto.limit || 50;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.attendanceModel
        .find(query)
        .populate('userId', 'firstName lastName email employeeId')
        .populate('approvedBy', 'firstName lastName')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      this.attendanceModel.countDocuments(query),
    ]);

    return {
      records,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getAttendanceAnalytics(dto: AttendanceAnalyticsDto) {
    return this.cache.wrap(
      `att:analytics:${stableHash(dto)}`,
      cacheTtlSeconds(this.config, 'medium'),
      () => this.loadAttendanceAnalytics(dto),
    );
  }

  private async loadAttendanceAnalytics(dto: AttendanceAnalyticsDto) {
    const year = dto.year || new Date().getFullYear();
    const month = dto.month || new Date().getMonth() + 1;

    const query: Record<string, unknown> = {};

    if (dto.userId) {
      query.userId = new Types.ObjectId(dto.userId);
    }

    const { start: startDate, end: endDate } = monthRangeUtc(year, month);
    query.date = { $gte: startDate, $lte: endDate };

    const records = await this.attendanceModel.find(query).sort({ date: 1 });

    const recordByDay = new Map<string, (typeof records)[0]>();
    for (const r of records) {
      recordByDay.set(toDateKey(new Date(r.date)), r);
    }

    const analytics = {
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      paidLeaveDays: 0,
      halfDays: 0,
      weekendDays: 0,
      lateDays: 0,
      attendancePercentage: 0,
      totalHoursWorked: 0,
      dailyBreakdown: [] as Array<{
        date: string;
        status: string;
        hoursWorked: number;
        isPaidLeave?: boolean;
        isLate?: boolean;
        checkInTime?: string;
      }>,
    };

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    analytics.totalDays = daysInMonth;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayRecord = recordByDay.get(dateKey);
      const dateObj = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = dateObj.getUTCDay();

      const dayData = {
        date: dateKey,
        status: dayRecord?.status || (isWeekend(dayOfWeek) ? 'weekend' : 'absent'),
        hoursWorked: dayRecord?.hoursWorked ?? 0,
        isPaidLeave: dayRecord?.isPaidLeave,
        isLate: dayRecord?.isLate ?? false,
        checkInTime: dayRecord?.checkInTime
          ? formatTime12h(formatStoredTime(new Date(dayRecord.checkInTime)))
          : undefined,
      };

      analytics.dailyBreakdown.push(dayData);

      if (dayRecord) {
        if (dayRecord.status === 'present') analytics.presentDays++;
        else if (dayRecord.status === 'absent') analytics.absentDays++;
        else if (dayRecord.status === 'leave') {
          analytics.leaveDays++;
          if (dayRecord.isPaidLeave) analytics.paidLeaveDays++;
        }         else if (dayRecord.status === 'half-day') analytics.halfDays++;
        else if (dayRecord.status === 'weekend') analytics.weekendDays++;

        if (dayRecord.isLate) analytics.lateDays++;

        analytics.totalHoursWorked += dayRecord.hoursWorked || 0;
      } else {
        if (isWeekend(dayOfWeek)) {
          analytics.weekendDays++;
        } else {
          analytics.absentDays++;
        }
      }
    }

    const workingDays = analytics.totalDays - analytics.weekendDays;
    analytics.attendancePercentage =
      workingDays > 0
        ? Math.round(((analytics.presentDays + analytics.halfDays * 0.5) / workingDays) * 100)
        : 0;

    return analytics;
  }

  async getUsersAttendanceAnalytics(userIds: string[], month?: number, year?: number) {
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;
    const sorted = [...userIds].sort();
    return this.cache.wrap(
      `att:team:${currentYear}-${currentMonth}:${stableHash(sorted)}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.loadUsersAttendanceAnalytics(sorted, currentMonth, currentYear),
    );
  }

  private async loadUsersAttendanceAnalytics(
    userIds: string[],
    currentMonth: number,
    currentYear: number,
  ) {
    const { start: startDate, end: endDate } = monthRangeUtc(currentYear, currentMonth);

    const records = await this.attendanceModel
      .find({
        userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
        date: { $gte: startDate, $lte: endDate },
      })
      .populate('userId', 'firstName lastName email employeeId');

    const analyticsMap = new Map();

    userIds.forEach((userId) => {
      analyticsMap.set(userId, {
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        paidLeaveDays: 0,
        halfDays: 0,
        weekendDays: 0,
        lateDays: 0,
        attendancePercentage: 0,
      });
    });

    records.forEach((record) => {
      const userId = record.userId._id.toString();
      const analytics = analyticsMap.get(userId);

      if (record.status === 'present') analytics.presentDays++;
      else if (record.status === 'absent') analytics.absentDays++;
      else if (record.status === 'leave') {
        analytics.leaveDays++;
        if (record.isPaidLeave) analytics.paidLeaveDays++;
      }       else if (record.status === 'half-day') analytics.halfDays++;
      else if (record.status === 'weekend') analytics.weekendDays++;
      if (record.isLate) analytics.lateDays++;
    });

    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();

    analyticsMap.forEach((analytics) => {
      const workingDays = daysInMonth - analytics.weekendDays;
      analytics.attendancePercentage = Math.round(
        ((analytics.presentDays + analytics.halfDays * 0.5) / workingDays) * 100,
      );
    });

    return Array.from(analyticsMap.entries()).map(([userId, analytics]) => ({
      userId,
      ...analytics,
    }));
  }

  async getYearlyAttendanceAnalytics(userId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();
    const startDate = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));

    const records = await this.attendanceModel.find({
      userId: new Types.ObjectId(userId),
      date: { $gte: startDate, $lte: endDate },
    });

    const monthlyData = Array(12)
      .fill(null)
      .map((_, i) => ({
        month: new Date(Date.UTC(targetYear, i, 1)).toLocaleString('en-IN', {
          month: 'short',
          timeZone: 'UTC',
        }),
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        paidLeaveDays: 0,
        halfDays: 0,
        weekendDays: 0,
        attendancePercentage: 0,
      }));

    records.forEach((record) => {
      const monthIndex = new Date(record.date).getUTCMonth();
      const monthData = monthlyData[monthIndex];

      if (record.status === 'present') monthData.presentDays++;
      else if (record.status === 'absent') monthData.absentDays++;
      else if (record.status === 'leave') {
        monthData.leaveDays++;
        if (record.isPaidLeave) monthData.paidLeaveDays++;
      } else if (record.status === 'half-day') monthData.halfDays++;
      else if (record.status === 'weekend') monthData.weekendDays++;
    });

    monthlyData.forEach((monthData) => {
      const totalDays = 30;
      const workingDays = totalDays - monthData.weekendDays;
      monthData.attendancePercentage = Math.round(
        ((monthData.presentDays + monthData.halfDays * 0.5) / workingDays) * 100,
      );
    });

    return monthlyData;
  }
}
