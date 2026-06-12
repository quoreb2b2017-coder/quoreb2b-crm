import { ForbiddenException, Injectable } from '@nestjs/common';
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
  isWeekendDateKey,
} from './attendance-date.util';
import {
  calendarDateKey,
  formatInWorkspace,
  formatWallTimeHHmm,
} from '../../common/utils/timezone.util';
import {
  currentTimeHHmm,
  formatStoredTime,
  formatTime12h,
  isLateCheckIn,
  isTodayDateKey,
  todayDateKey,
} from './attendance-late.util';
import { SystemRole } from '../../common/constants/roles.constant';
import {
  buildAttendanceWorkTimeSnapshot,
  computeDayWorkMinutes,
  computeNetWorkMinutes,
  formatWorkDurationFromMinutes,
  isDailyGrossQuotaMet,
  isDailyWorkQuotaMet,
} from './attendance-work-time.util';
import { BreakPunchesService } from '../break-punches/break-punches.service';
import { ActivityLog } from '../activity-logs/schemas/activity-log.schema';
import {
  buildAuthBoundaryForDay,
  buildSessionGrossMinutesByDay,
  formatIstTime12h,
  resolveActiveSessionId,
  type ActivityLogRow,
} from '../activity-logs/employee-report.util';

const LOGIN_ATTENDANCE_ROLES = new Set<string>([
  SystemRole.EMPLOYEE,
  SystemRole.ADMIN,
  SystemRole.SUPER_ADMIN,
  SystemRole.DB_ADMIN,
]);

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLog>,
    private notifications: NotificationTriggerService,
    private cache: AppCacheService,
    private config: ConfigService,
    private breakPunchesService: BreakPunchesService,
  ) {}

  private static readonly ADMIN_MARK_ROLES = new Set<string>([
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.DB_ADMIN,
  ]);

  assertCanMarkForUser(actorId: string, actorRoles: string[], targetUserId: string) {
    if (actorId === targetUserId) return;
    if (!actorRoles.some((r) => AttendanceService.ADMIN_MARK_ROLES.has(r))) {
      throw new ForbiddenException('Only administrators can edit another user’s attendance');
    }
  }

  /** Login / logout columns — EOD record wins over live session (re-login same day must not hide checkout). */
  private resolveDayCheckInOut(
    dayRecord:
      | {
          checkInTime?: Date;
          checkOutTime?: Date;
          eodClosed?: boolean;
        }
      | undefined,
    authBounds: ReturnType<typeof buildAuthBoundaryForDay> | null,
  ): { checkInTime?: string; checkOutTime?: string } {
    if (dayRecord?.eodClosed) {
      return {
        checkInTime: dayRecord.checkInTime
          ? formatTime12h(formatStoredTime(new Date(dayRecord.checkInTime)))
          : authBounds?.firstLoginAt
            ? formatIstTime12h(authBounds.firstLoginAt)
            : undefined,
        checkOutTime: dayRecord.checkOutTime
          ? formatTime12h(formatStoredTime(new Date(dayRecord.checkOutTime)))
          : authBounds?.lastLogoutAt
            ? formatIstTime12h(authBounds.lastLogoutAt)
            : undefined,
      };
    }

    const checkInTime =
      authBounds?.firstLoginAt != null
        ? formatIstTime12h(authBounds.firstLoginAt)
        : dayRecord?.checkInTime
          ? formatTime12h(formatStoredTime(new Date(dayRecord.checkInTime)))
          : undefined;

    const checkOutTime =
      authBounds != null
        ? authBounds.lastLogoutAt
          ? formatIstTime12h(authBounds.lastLogoutAt)
          : authBounds.onDuty
            ? undefined
            : dayRecord?.checkOutTime
              ? formatTime12h(formatStoredTime(new Date(dayRecord.checkOutTime)))
              : undefined
        : dayRecord?.checkOutTime
          ? formatTime12h(formatStoredTime(new Date(dayRecord.checkOutTime)))
          : undefined;

    return { checkInTime, checkOutTime };
  }

  private async invalidateAttendanceCaches(userId: string, dateKey: string) {
    const parts = dateKey.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    await Promise.all([
      this.cache.delByPrefix('att:analytics:'),
      this.cache.delByPrefix(`att:yearly:${userId}:`),
      this.cache.delByPrefix(`att:team:${year}-${month}:`),
      this.cache.delByPrefix(`act:worktime:${userId}:`),
      this.cache.delByPrefix(`act:team-worktime:${year}-${month}:`),
    ]);
  }

  async markAttendance(dto: MarkAttendanceDto) {
    const normalizedDate = parseDateOnly(dto.date);
    const dayOfWeek = normalizedDate.getUTCDay();

    const existing = await this.attendanceModel
      .findOne({
        userId: new Types.ObjectId(dto.userId),
        date: normalizedDate,
      })
      .lean()
      .exec();

    // Auto-mark Saturday (6) and Sunday (0) as weekend
    let status = dto.status;
    if (isWeekendDateKey(dto.date)) {
      status = 'weekend';
    }

    const tracksTime = status === 'present' || status === 'half-day';
    let checkInTime: Date | null = existing?.checkInTime
      ? new Date(existing.checkInTime)
      : null;
    let checkOutTime: Date | null = existing?.checkOutTime
      ? new Date(existing.checkOutTime)
      : null;
    let resolvedCheckInHHmm: string | undefined;
    let isLate = existing?.isLate ?? false;

    if (tracksTime) {
      if (dto.checkInTime) {
        resolvedCheckInHHmm = dto.checkInTime;
        checkInTime = combineDateAndTime(dto.date, dto.checkInTime);
      } else if (
        !checkInTime &&
        !dto.checkOutTime &&
        !isWeekend(dayOfWeek) &&
        isTodayDateKey(dto.date)
      ) {
        resolvedCheckInHHmm = currentTimeHHmm();
        checkInTime = combineDateAndTime(dto.date, resolvedCheckInHHmm);
      } else if (checkInTime) {
        resolvedCheckInHHmm = formatStoredTime(checkInTime);
      }

      if (resolvedCheckInHHmm && !existing?.checkInTime) {
        isLate = isLateCheckIn(resolvedCheckInHHmm);
      }

      if (dto.checkOutTime) {
        checkOutTime = combineDateAndTime(dto.date, dto.checkOutTime);
        if (checkInTime && checkOutTime <= checkInTime) {
          checkOutTime = new Date(checkOutTime.getTime() + 24 * 60 * 60 * 1000);
        }
      }
    }

    const hoursWorked =
      dto.hoursWorked ??
      (checkInTime && checkOutTime
        ? Math.max(0, (checkOutTime.getTime() - checkInTime.getTime()) / 3600000)
        : (existing?.hoursWorked ?? 0));

    const record = await this.attendanceModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(dto.userId),
        date: normalizedDate,
      },
      {
        $set: {
          status,
          ...(checkInTime ? { checkInTime } : {}),
          ...(checkOutTime ? { checkOutTime } : {}),
          hoursWorked: Math.round(hoursWorked * 100) / 100,
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          isPaidLeave: status === 'leave' ? (dto.isPaidLeave ?? false) : false,
          isLate: tracksTime ? isLate : false,
        },
      },
      { upsert: true, new: true },
    );

    await this.invalidateAttendanceCaches(dto.userId, dto.date.slice(0, 10));
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

  /**
   * Every login while off duty: auto punch-in at current IST time so the work timer starts immediately.
   * If already on duty (open punch today), keep the existing punch-in time.
   */
  async ensureLoginAttendance(
    userId: string,
    roles: string[] = [],
  ): Promise<{
    punchedIn: boolean;
    alreadyCheckedIn?: boolean;
    dayClosed?: boolean;
    isLate?: boolean;
    checkInTime?: string;
    checkOutTime?: string;
    checkInAt?: string;
    checkOutAt?: string;
  }> {
    if (!roles.some((r) => LOGIN_ATTENDANCE_ROLES.has(r))) {
      return { punchedIn: false };
    }

    const dateKey = todayDateKey();
    const normalizedDate = parseDateOnly(dateKey);

    const existing = await this.attendanceModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date: normalizedDate,
      })
      .lean()
      .exec();

    const onDuty =
      !!existing?.checkInTime &&
      (existing.status === 'present' || existing.status === 'half-day') &&
      !existing.checkOutTime;

    if (onDuty && existing?.checkInTime) {
      const hhmm = formatStoredTime(new Date(existing.checkInTime));
      return {
        punchedIn: true,
        alreadyCheckedIn: true,
        isLate: existing.isLate ?? false,
        checkInTime: formatTime12h(hhmm),
        checkInAt: new Date(existing.checkInTime).toISOString(),
      };
    }

    /** EOD closed — final checkout kept; new attendance only on the next calendar day. */
    if (existing?.eodClosed && existing?.checkInTime) {
      const hhmm = formatStoredTime(new Date(existing.checkInTime));
      const outHhmm = existing.checkOutTime
        ? formatStoredTime(new Date(existing.checkOutTime))
        : undefined;
      return {
        punchedIn: false,
        dayClosed: true,
        alreadyCheckedIn: true,
        isLate: existing.isLate ?? false,
        checkInTime: formatTime12h(hhmm),
        checkOutTime: outHhmm ? formatTime12h(outHhmm) : undefined,
        checkInAt: new Date(existing.checkInTime).toISOString(),
        checkOutAt: existing.checkOutTime
          ? new Date(existing.checkOutTime).toISOString()
          : undefined,
      };
    }

    /** Normal sign-out / sleep — session ended; re-login same day resumes (clears checkout). */
    if (existing?.checkInTime && existing?.checkOutTime && !existing.eodClosed) {
      await this.attendanceModel.updateOne(
        { _id: existing._id },
        { $unset: { checkOutTime: '' }, $set: { status: 'present' } },
      );
      await this.invalidateAttendanceCaches(userId, dateKey);
      const hhmm = formatStoredTime(new Date(existing.checkInTime));
      return {
        punchedIn: true,
        alreadyCheckedIn: true,
        isLate: existing.isLate ?? false,
        checkInTime: formatTime12h(hhmm),
        checkInAt: new Date(existing.checkInTime).toISOString(),
      };
    }

    const checkInHHmm = currentTimeHHmm();
    const isLate = isLateCheckIn(checkInHHmm);

    const record = await this.markAttendance({
      userId,
      date: dateKey,
      status: 'present',
      checkInTime: checkInHHmm,
    });

    const checkInAt = record.checkInTime
      ? new Date(record.checkInTime).toISOString()
      : new Date().toISOString();

    return {
      punchedIn: true,
      alreadyCheckedIn: !!existing?.checkInTime,
      isLate,
      checkInTime: formatTime12h(checkInHHmm),
      checkInAt,
    };
  }

  /**
   * Normal sign-out or sleep/idle logout — session checkout only (day stays open for re-login).
   */
  async ensureSessionLogoutAttendance(
    userId: string,
    roles: string[] = [],
    at: Date = new Date(),
  ): Promise<void> {
    if (!roles.some((r) => LOGIN_ATTENDANCE_ROLES.has(r))) return;

    const dateKey = calendarDateKey(at);
    const normalizedDate = parseDateOnly(dateKey);
    const existing = await this.attendanceModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date: normalizedDate,
      })
      .lean()
      .exec();

    if (!existing?.checkInTime || existing.eodClosed) return;

    const checkOutHHmm = formatWallTimeHHmm(at);
    let checkOutTime = combineDateAndTime(dateKey, checkOutHHmm);
    const checkInTime = new Date(existing.checkInTime);
    if (checkOutTime <= checkInTime) {
      checkOutTime = new Date(checkOutTime.getTime() + 24 * 60 * 60 * 1000);
    }

    await this.attendanceModel.updateOne(
      { _id: existing._id },
      { $set: { checkOutTime, status: 'present', eodClosed: false } },
    );
    await this.invalidateAttendanceCaches(userId, dateKey);
  }

  /**
   * Quick Punch EOD logout — final checkout; same-day attendance locked until tomorrow.
   */
  async ensureEodLogoutAttendance(
    userId: string,
    roles: string[] = [],
    at: Date = new Date(),
  ): Promise<void> {
    if (!roles.some((r) => LOGIN_ATTENDANCE_ROLES.has(r))) return;

    const dateKey = calendarDateKey(at);
    const normalizedDate = parseDateOnly(dateKey);
    const existing = await this.attendanceModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date: normalizedDate,
      })
      .lean()
      .exec();

    if (!existing?.checkInTime) return;

    const checkOutHHmm = formatWallTimeHHmm(at);
    let checkOutTime = combineDateAndTime(dateKey, checkOutHHmm);
    const checkInTime = new Date(existing.checkInTime);
    if (checkOutTime <= checkInTime) {
      checkOutTime = new Date(checkOutTime.getTime() + 24 * 60 * 60 * 1000);
    }

    await this.attendanceModel.updateOne(
      { _id: existing._id },
      { $set: { checkOutTime, status: 'present', eodClosed: true } },
    );
    await this.invalidateAttendanceCaches(userId, dateKey);
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

    const periodEnd = new Date();
    const records = await this.attendanceModel.find(query).sort({ date: 1 });

    const breakMinutesByDate = dto.userId
      ? await this.breakPunchesService.getBreakMinutesByDateForUser(
          dto.userId,
          startDate,
          endDate,
          periodEnd,
        )
      : new Map<string, number>();

    let sessionGrossByDay = new Map<string, number>();
    let sessionLogs: ActivityLogRow[] = [];
    let activeSessionId: string | undefined;
    if (dto.userId) {
      sessionLogs = (await this.activityLogModel
        .find({
          userId: new Types.ObjectId(dto.userId),
          sessionId: { $exists: true, $ne: '' },
          $or: [
            { occurredAt: { $gte: startDate, $lte: endDate } },
            { createdAt: { $gte: startDate, $lte: endDate } },
          ],
        })
        .lean()
        .exec()) as unknown as ActivityLogRow[];
      activeSessionId = resolveActiveSessionId(sessionLogs);
      sessionGrossByDay = buildSessionGrossMinutesByDay(sessionLogs, periodEnd, {
        activeSessionId,
      });
    }
    const useSessionActiveTime = sessionGrossByDay.size > 0;

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
        checkOutTime?: string;
        workDurationMinutes?: number;
        workDurationFormatted?: string;
        grossWorkDurationMinutes?: number;
        breakMinutes?: number;
        dailyTargetMet?: boolean;
        dailyGrossTargetMet?: boolean;
        grossWorkDurationFormatted?: string;
        eodClosed?: boolean;
      }>,
    };

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    analytics.totalDays = daysInMonth;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayRecord = recordByDay.get(dateKey);
      const dateObj = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = dateObj.getUTCDay();
      const grossMinutes = useSessionActiveTime
        ? (sessionGrossByDay.get(dateKey) ?? 0)
        : computeDayWorkMinutes(dayRecord, dateKey, periodEnd);
      const breakMinutes = breakMinutesByDate.get(dateKey) ?? 0;
      const netMinutes = computeNetWorkMinutes(grossMinutes, breakMinutes);
      const workHours = Math.round((netMinutes / 60) * 100) / 100;

      const authBounds =
        useSessionActiveTime && sessionLogs.length > 0
          ? buildAuthBoundaryForDay(sessionLogs, dateKey, periodEnd, activeSessionId)
          : null;

      const { checkInTime, checkOutTime } = this.resolveDayCheckInOut(dayRecord, authBounds);

      const resolvedStatus =
        dayRecord?.status === 'weekend' && !isWeekendDateKey(dateKey)
          ? 'absent'
          : dayRecord?.status || (isWeekend(dayOfWeek) ? 'weekend' : 'absent');

      const dayData = {
        date: dateKey,
        status: resolvedStatus,
        hoursWorked: workHours,
        isPaidLeave: dayRecord?.isPaidLeave,
        isLate: dayRecord?.isLate ?? false,
        checkInTime,
        checkOutTime,
        grossWorkDurationMinutes: grossMinutes,
        breakMinutes,
        workDurationMinutes: netMinutes,
        workDurationFormatted: formatWorkDurationFromMinutes(netMinutes),
        grossWorkDurationFormatted: formatWorkDurationFromMinutes(grossMinutes),
        dailyTargetMet: isDailyWorkQuotaMet(netMinutes),
        dailyGrossTargetMet: isDailyGrossQuotaMet(grossMinutes),
        eodClosed: dayRecord?.eodClosed ?? false,
      };

      analytics.dailyBreakdown.push(dayData);

      if (dayRecord) {
        if (dayRecord.status === 'present') analytics.presentDays++;
        else if (dayRecord.status === 'absent') analytics.absentDays++;
        else if (dayRecord.status === 'leave') {
          analytics.leaveDays++;
          if (dayRecord.isPaidLeave) analytics.paidLeaveDays++;
        }         else if (dayRecord.status === 'half-day') analytics.halfDays++;
        else if (dayRecord.status === 'weekend' && isWeekendDateKey(dateKey)) {
          analytics.weekendDays++;
        } else if (dayRecord.status === 'weekend') {
          analytics.absentDays++;
        }

        if (dayRecord.isLate) analytics.lateDays++;

        analytics.totalHoursWorked += workHours;
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

  async getYearlyAttendanceAnalytics(userId: string, year?: number, skipCache = false) {
    const targetYear = Number(year) || new Date().getFullYear();
    if (skipCache) {
      return this.loadYearlyAttendanceAnalytics(userId, targetYear);
    }
    return this.cache.wrap(
      `att:yearly:${userId}:${targetYear}`,
      cacheTtlSeconds(this.config, 'medium'),
      () => this.loadYearlyAttendanceAnalytics(userId, targetYear),
    );
  }

  /** Same counting rules as monthly analytics — one rollup row per calendar month. */
  private async loadYearlyAttendanceAnalytics(userId: string, targetYear: number) {
    const monthlyAnalytics = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        this.loadAttendanceAnalytics({ userId, year: targetYear, month: i + 1 }),
      ),
    );

    return monthlyAnalytics.map((analytics, i) => ({
      month: new Date(Date.UTC(targetYear, i, 1)).toLocaleString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      }),
      presentDays: analytics.presentDays,
      absentDays: analytics.absentDays,
      leaveDays: analytics.leaveDays,
      paidLeaveDays: analytics.paidLeaveDays,
      halfDays: analytics.halfDays,
      weekendDays: analytics.weekendDays,
      lateDays: analytics.lateDays,
      attendancePercentage: analytics.attendancePercentage,
      totalHoursWorked: analytics.totalHoursWorked,
    }));
  }

  async getDayAttendanceRecord(userId: string, dateKey: string) {
    return this.attendanceModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date: parseDateOnly(dateKey),
      })
      .lean()
      .exec();
  }

  async getWorkTimeSnapshot(userId: string, year?: number, month?: number, periodEnd = new Date()) {
    const y = year ?? periodEnd.getFullYear();
    const m = month ?? periodEnd.getMonth() + 1;
    const { start, end } = monthRangeUtc(y, m);
    const records = await this.attendanceModel
      .find({
        userId: new Types.ObjectId(userId),
        date: { $gte: start, $lte: end },
      })
      .lean()
      .exec();
    const breakMinutesByDate = await this.breakPunchesService.getBreakMinutesByDateForUser(
      userId,
      start,
      end,
      periodEnd,
    );
    return buildAttendanceWorkTimeSnapshot(records, y, m, periodEnd, breakMinutesByDate);
  }

  async getTeamWorkTimeFromAttendance(userIds: string[], year: number, month: number) {
    const { start, end } = monthRangeUtc(year, month);
    const periodEnd = new Date();
    const validIds = userIds.filter((id) => Types.ObjectId.isValid(id));
    const objectIds = validIds.map((id) => new Types.ObjectId(id));
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    const [allSessionLogs, records] = await Promise.all([
      this.activityLogModel
        .find({
          userId: { $in: objectIds },
          sessionId: { $exists: true, $ne: '' },
          $or: [
            { occurredAt: { $gte: start, $lte: end } },
            { createdAt: { $gte: start, $lte: end } },
          ],
        })
        .lean()
        .exec(),
      this.attendanceModel
        .find({
          userId: { $in: objectIds },
          date: { $gte: start, $lte: end },
        })
        .lean()
        .exec(),
    ]);

    const logsByUser = new Map<string, ActivityLogRow[]>();
    for (const log of allSessionLogs) {
      const uid = String((log as { userId: Types.ObjectId }).userId);
      const list = logsByUser.get(uid) ?? [];
      list.push(log as unknown as ActivityLogRow);
      logsByUser.set(uid, list);
    }

    const recordsByUser = new Map<string, typeof records>();
    for (const r of records) {
      const uid = r.userId.toString();
      const list = recordsByUser.get(uid) ?? [];
      list.push(r);
      recordsByUser.set(uid, list);
    }

    const label = formatInWorkspace(new Date(year, month - 1, 1), {
      month: 'long',
      year: 'numeric',
    });

    const breakMaps = await Promise.all(
      validIds.map(async (userId) => ({
        userId,
        breaks: await this.breakPunchesService.getBreakMinutesByDateForUser(
          userId,
          start,
          end,
          periodEnd,
        ),
      })),
    );
    const breakByUser = new Map(breakMaps.map((b) => [b.userId, b.breaks]));

    const users = validIds.map((userId) => {
      const sessionLogs = logsByUser.get(userId) ?? [];
      const breaks = breakByUser.get(userId) ?? new Map();
      let monthlyMinutes = 0;

      if (sessionLogs.length > 0) {
        const activeSessionId = resolveActiveSessionId(sessionLogs);
        const grossByDay = buildSessionGrossMinutesByDay(sessionLogs, periodEnd, {
          activeSessionId,
        });
        for (const [dateKey, gross] of grossByDay.entries()) {
          if (!dateKey.startsWith(monthPrefix)) continue;
          monthlyMinutes += computeNetWorkMinutes(gross, breaks.get(dateKey) ?? 0);
        }
      } else {
        const snap = buildAttendanceWorkTimeSnapshot(
          recordsByUser.get(userId) ?? [],
          year,
          month,
          periodEnd,
          breaks,
        );
        monthlyMinutes = snap.monthlyMinutes;
      }

      return {
        userId,
        monthlyMinutes,
        monthlyFormatted: formatWorkDurationFromMinutes(monthlyMinutes),
      };
    });

    return { period: { year, month, label }, users };
  }
}
