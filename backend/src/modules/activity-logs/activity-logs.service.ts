import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersRepository } from '../users/users.repository';
import { User } from '../users/schemas/user.schema';
import { Batch } from '../batches/schemas/batch.schema';
import { ActivityLog } from './schemas/activity-log.schema';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { TrackActivityDto } from './dto/track-activity.dto';
import { ActivityLogsQueryDto } from './dto/activity-logs-query.dto';
import { WORKSPACE_TIMEZONE } from '../../common/constants/workspace-timezone.constant';
import { calendarDateKey, formatInWorkspace } from '../../common/utils/timezone.util';
import {
  buildAuthBoundaryForDay,
  buildEmployeeReport,
  buildWorkTimeSnapshot,
  dayBounds,
  formatDuration,
  formatIstTime12h,
  listSessionsForIstDay,
  monthBounds,
  type ActivityLogRow,
} from './employee-report.util';
import {
  computeNetWorkMinutes,
  isDailyWorkQuotaMet,
} from '../attendance/attendance-work-time.util';
import { formatStoredTime, formatTime12h } from '../attendance/attendance-late.util';
import { DAILY_NET_WORK_TARGET_MINUTES } from '../attendance/attendance-shift.constants';
import type { BatchLeadSnapshot } from './lead-activity-report.util';
import { SystemRole } from '../../common/constants/roles.constant';
import { AppCacheService } from '../../redis/app-cache.service';
import { ConfigService } from '@nestjs/config';
import { cacheTtlSeconds, stableHash } from '../../redis/cache.util';
import {
  ActivityActor,
  actorFields,
  displayName,
  displayNameFromMeta,
  type SanitizedUserSnapshot,
} from './activity-user.util';
import { formatActivityDateTime } from './activity-date.util';
import {
  PASSIVE_ACTIVITY_ACTIONS,
  isRecordableTrackAction,
} from './activity-actions.constant';
import { AttendanceService } from '../attendance/attendance.service';
import { BreakPunchesService } from '../break-punches/break-punches.service';

export interface TrackActivityContext {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  roles?: string[];
  sessionId?: string;
  userAgent?: string;
}

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectModel(ActivityLog.name) private model: Model<ActivityLog>,
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
    private usersRepository: UsersRepository,
    private cache: AppCacheService,
    private config: ConfigService,
    private attendanceService: AttendanceService,
    private breakPunchesService: BreakPunchesService,
  ) {}

  private userSnapshot(user: User): SanitizedUserSnapshot {
    const obj = user.toObject ? user.toObject() : user;
    return {
      id: (obj._id as Types.ObjectId).toString(),
      email: obj.email,
      firstName: obj.firstName,
      lastName: obj.lastName,
      employeeId: obj.employeeId,
      roles: obj.roles,
    };
  }

  async log(data: Partial<ActivityLog>) {
    const occurredAt =
      data.occurredAt instanceof Date
        ? data.occurredAt
        : data.occurredAt
          ? new Date(data.occurredAt as string | number)
          : new Date();
    return this.model.create({ ...data, occurredAt });
  }

  async logWithActor(actor: ActivityActor | null, data: Partial<ActivityLog>) {
    const resolved = await this.resolveActor(actor);
    const fields = actorFields(resolved);
    const { ipAddress: _ip, ...rest } = data;
    const created = await this.log({
      ...rest,
      ...fields,
      metadata: {
        ...((data.metadata as Record<string, unknown>) ?? {}),
        recordedAt: new Date().toISOString(),
      },
    });
    return created;
  }

  private async resolveActor(actor: ActivityActor | null): Promise<ActivityActor | null> {
    if (!actor?.id || !Types.ObjectId.isValid(actor.id)) return actor;
    try {
      const user = await this.usersRepository.findById(actor.id);
      if (!user) return actor;
      const snap = this.userSnapshot(user);
      return {
        id: snap.id,
        email: snap.email ?? actor.email,
        firstName: snap.firstName ?? actor.firstName,
        lastName: snap.lastName ?? actor.lastName,
        employeeId: snap.employeeId ?? actor.employeeId,
        roles: snap.roles?.length ? snap.roles : actor.roles,
      };
    } catch {
      return actor;
    }
  }

  async track(dto: TrackActivityDto, ctx: TrackActivityContext) {
    if (!isRecordableTrackAction(dto.action)) {
      return { recorded: false, reason: 'passive_action_ignored' };
    }
    if (!ctx.userId || !Types.ObjectId.isValid(ctx.userId)) {
      throw new BadRequestException('Invalid user');
    }
    const actor: ActivityActor = {
      id: ctx.userId,
      email: ctx.email,
      firstName: ctx.firstName,
      lastName: ctx.lastName,
      employeeId: ctx.employeeId,
      roles: ctx.roles,
    };
    return this.logWithActor(actor, {
      action: dto.action,
      resource: dto.resource,
      resourceId: dto.resourceId,
      path: dto.path,
      metadata: dto.metadata,
      userAgent: ctx.userAgent,
      sessionId: ctx.sessionId,
    });
  }

  private async loadUserMap(
    items: Array<Record<string, unknown>>,
  ): Promise<Map<string, SanitizedUserSnapshot>> {
    const ids = [
      ...new Set(
        items
          .map((row) => (row.userId ? String(row.userId) : ''))
          .filter((id) => id && Types.ObjectId.isValid(id)),
      ),
    ];
    const users = await this.usersRepository.findByIds(ids);
    const map = new Map<string, SanitizedUserSnapshot>();
    for (const u of users) {
      const snap = this.userSnapshot(u);
      map.set(snap.id, snap);
    }
    return map;
  }

  private buildListFilter(dto: ActivityLogsQueryDto): Record<string, unknown> | null {
    const excludePassive = { action: { $nin: [...PASSIVE_ACTIVITY_ACTIONS] } };
    const filter: Record<string, unknown> = { ...excludePassive };

    if (dto.userId && Types.ObjectId.isValid(dto.userId)) {
      filter.userId = new Types.ObjectId(dto.userId);
    }
    if (dto.role) {
      if (dto.role === SystemRole.SUPER_ADMIN) {
        filter.userRole = { $in: [SystemRole.SUPER_ADMIN, SystemRole.ADMIN] };
      } else {
        filter.userRole = dto.role;
      }
    }
    if (dto.action) {
      const actionQuery = dto.action.trim();
      if (PASSIVE_ACTIVITY_ACTIONS.has(actionQuery.toUpperCase())) {
        return null;
      }
      delete filter.action;
      filter.$and = [
        excludePassive,
        { action: { $regex: actionQuery, $options: 'i' } },
      ];
    }
    if (dto.search) {
      filter.$or = [
        { userName: { $regex: dto.search, $options: 'i' } },
        { userEmail: { $regex: dto.search, $options: 'i' } },
        { employeeId: { $regex: dto.search, $options: 'i' } },
        { action: { $regex: dto.search, $options: 'i' } },
        { resource: { $regex: dto.search, $options: 'i' } },
        { path: { $regex: dto.search, $options: 'i' } },
      ];
    }

    if (dto.date) {
      const { start, end } = dayBounds(dto.date);
      filter.occurredAt = { $gte: start, $lte: end };
    } else if (dto.year != null && dto.month != null) {
      const { start, end } = monthBounds(dto.year, dto.month);
      filter.occurredAt = { $gte: start, $lte: end };
    }

    return filter;
  }

  async getActivityStats(dto: ActivityLogsQueryDto) {
    return this.cache.wrap(
      `act:stats:${stableHash(dto)}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.loadActivityStats(dto),
    );
  }

  private async loadActivityStats(dto: ActivityLogsQueryDto) {
    const filter = this.buildListFilter(dto);
    if (!filter) {
      return { total: 0, byAction: [], timeline: [], byUser: [] };
    }

    const isDayView = Boolean(dto.date);
    const timelineGroup = isDayView
      ? {
          _id: {
            $hour: { date: '$occurredAt', timezone: WORKSPACE_TIMEZONE },
          },
        }
      : {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$occurredAt',
              timezone: WORKSPACE_TIMEZONE,
            },
          },
        };

    const [total, byActionRows, timelineRows, byUserRows] = await Promise.all([
      this.model.countDocuments(filter).exec(),
      this.model
        .aggregate<{ _id: string; count: number }>([
          { $match: filter },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 12 },
        ])
        .exec(),
      this.model
        .aggregate<{ _id: string | number; count: number }>([
          { $match: filter },
          { $group: { ...timelineGroup, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .exec(),
      dto.userId
        ? Promise.resolve([])
        : this.model
            .aggregate<{
              _id: Types.ObjectId;
              count: number;
              userName?: string;
              userEmail?: string;
            }>([
              { $match: filter },
              {
                $group: {
                  _id: '$userId',
                  count: { $sum: 1 },
                  userName: { $first: '$userName' },
                  userEmail: { $first: '$userEmail' },
                },
              },
              { $match: { _id: { $ne: null } } },
              { $sort: { count: -1 } },
              { $limit: 8 },
            ])
            .exec(),
    ]);

    const byAction = byActionRows.map((r) => ({
      action: r._id,
      count: r.count,
    }));

    const timeline = timelineRows.map((r) => ({
      key: String(r._id),
      count: r.count,
      label: isDayView
        ? `${String(r._id).padStart(2, '0')}:00`
        : formatInWorkspace(new Date(String(r._id) + 'T12:00:00'), {
            day: '2-digit',
            month: 'short',
          }),
    }));

    const userMap =
      byUserRows.length > 0
        ? await this.loadUserMap(byUserRows.map((r) => ({ userId: r._id })))
        : new Map();

    const byUser = byUserRows.map((r) => {
      const id = r._id?.toString() ?? '';
      const snap = userMap.get(id);
      return {
        userId: id,
        count: r.count,
        name: snap ? displayName(snap) : r.userName ?? 'Unknown',
        email: snap?.email ?? r.userEmail,
      };
    });

    return { total, byAction, timeline, byUser };
  }

  async findAll(dto: ActivityLogsQueryDto) {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 50, 200);
    const filter = this.buildListFilter(dto);
    if (!filter) {
      return paginate([], 0, { ...dto, page, limit });
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ occurredAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    const userMap = await this.loadUserMap(items as Record<string, unknown>[]);
    const data = items.map((row) =>
      this.formatLogRow(row as Record<string, unknown>, userMap),
    );
    return paginate(data, total, { ...dto, page, limit });
  }

  private formatLogRow(
    row: Record<string, unknown>,
    userMap?: Map<string, SanitizedUserSnapshot>,
  ) {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const { createdAt, dateFormatted } = formatActivityDateTime(row);
    const userId = row.userId ? String(row.userId) : undefined;
    const dbUser: SanitizedUserSnapshot | undefined =
      userId && userMap ? userMap.get(userId) : undefined;

    const storedName = row.userName as string | undefined;
    const userName = dbUser
      ? displayName(dbUser)
      : storedName && storedName !== 'Unknown'
        ? storedName
        : displayNameFromMeta(meta) ?? 'Unknown';

    const userEmail =
      dbUser?.email ?? (row.userEmail as string) ?? (meta.email as string);
    const employeeId =
      dbUser?.employeeId ?? (row.employeeId as string) ?? (meta.employeeId as string);
    const userRole = dbUser?.roles?.[0]
      ?? (row.userRole as string)
      ?? (meta.role as string)
      ?? 'unknown';

    return {
      id: String(row._id),
      userId,
      userName,
      userEmail,
      userRole,
      employeeId,
      action: row.action as string,
      resource: row.resource as string,
      resourceId: row.resourceId as string | undefined,
      path: row.path as string | undefined,
      metadata: meta,
      sessionId: row.sessionId as string | undefined,
      createdAt,
      dateFormatted,
    };
  }

  async findByUser(userId: string, limit = 200) {
    const items = await this.model
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    const userMap = await this.loadUserMap(items as Record<string, unknown>[]);
    return items.map((row) =>
      this.formatLogRow(row as Record<string, unknown>, userMap),
    );
  }

  async findSessionsByUser(userId: string, limit = 100) {
    return this.model
      .find({
        userId: new Types.ObjectId(userId),
        action: { $in: ['LOGIN', 'LOGOUT', 'IDLE_LOGOUT'] },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  private async findInRange(userId: string, start: Date, end: Date) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user id');
    }
    return this.model
      .find({
        userId: new Types.ObjectId(userId),
        $or: [
          { occurredAt: { $gte: start, $lte: end } },
          { createdAt: { $gte: start, $lte: end } },
        ],
      })
      .sort({ occurredAt: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  private async loadEmployeeLeadBatches(userId: string): Promise<BatchLeadSnapshot[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    const user = await this.usersRepository.findById(userId);
    const roles = (user?.roles as string[]) ?? [];
    const isEmployeeOnly =
      roles.includes(SystemRole.EMPLOYEE) &&
      !roles.includes(SystemRole.DB_ADMIN) &&
      !roles.includes(SystemRole.ADMIN) &&
      !roles.includes(SystemRole.SUPER_ADMIN);

    const id = new Types.ObjectId(userId);
    const filter: Record<string, unknown> = isEmployeeOnly
      ? { sharedWith: id }
      : { $or: [{ sharedWith: id }, { createdBy: id }] };

    const batches = await this.batchModel
      .find(filter)
      .select('name headers rows sharedWith createdBy')
      .lean()
      .exec();

    return batches
      .filter((b) => ((b as { rows?: string[][] }).rows?.length ?? 0) > 0)
      .map((b: Record<string, unknown>) => {
      const doc = b;
      const batchId = String(doc._id);
      const sharedWith = ((doc.sharedWith as Types.ObjectId[]) ?? []).map((u) =>
        u.toString(),
      );
      return {
        batchId,
        batchName: String(doc.name ?? 'Batch'),
        headers: (doc.headers as string[]) ?? [],
        rows: (doc.rows as string[][]) ?? [],
        assignedViaShare: sharedWith.includes(userId),
      };
    });
  }

  private async resolveReportEmployee(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      return { id: userId, name: 'Unknown', email: undefined, employeeId: undefined };
    }
    const snap = this.userSnapshot(user);
    return {
      id: snap.id,
      name: displayName(snap as ActivityActor),
      email: snap.email,
      employeeId: snap.employeeId,
    };
  }

  async getDailyReport(userId: string, dateStr: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const today = new Date().toISOString().slice(0, 10);
    const ttlKind = dateStr === today ? 'live' : 'long';
    return this.cache.wrap(
      `act:report:daily:${userId}:${dateStr}`,
      cacheTtlSeconds(this.config, ttlKind),
      async () => {
        const { start, end, label } = dayBounds(dateStr);
        const [logs, leadBatches, employee] = await Promise.all([
          this.findInRange(userId, start, end),
          this.loadEmployeeLeadBatches(userId),
          this.resolveReportEmployee(userId),
        ]);
        return buildEmployeeReport(logs as unknown as ActivityLogRow[], {
          type: 'daily',
          label,
          start,
          end,
          leadBatches,
          employee,
        });
      },
    );
  }

  async getMonthlyReport(userId: string, year: number, month: number) {
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    return this.cache.wrap(
      `act:report:monthly:${userId}:${year}-${month}`,
      cacheTtlSeconds(this.config, isCurrentMonth ? 'short' : 'long'),
      async () => {
        const { start, end, label } = monthBounds(year, month);
        const [logs, leadBatches, employee] = await Promise.all([
          this.findInRange(userId, start, end),
          this.loadEmployeeLeadBatches(userId),
          this.resolveReportEmployee(userId),
        ]);
        return buildEmployeeReport(logs as unknown as ActivityLogRow[], {
          type: 'monthly',
          label,
          start,
          end,
          leadBatches,
          employee,
        });
      },
    );
  }

  async getMyWorkTime(userId: string, sessionId?: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { start, end } = monthBounds(year, month);

    const [logs, attendanceSnap] = await Promise.all([
      this.findInRange(userId, start, end),
      this.attendanceService.getWorkTimeSnapshot(userId, year, month, now),
    ]);

    const sessionSnap = buildWorkTimeSnapshot(logs as unknown as ActivityLogRow[], {
      sessionId,
      periodEnd: now,
    });

    const attendanceByDate = new Map(
      attendanceSnap.dailyBreakdown.map((row) => [row.date, row]),
    );

    const dailyBreakdown = sessionSnap.dailyBreakdown.map((day) => {
      const att = attendanceByDate.get(day.date);
      const grossMinutes = day.totalMinutes;
      const breakMinutes = att?.breakMinutes ?? 0;
      const netMinutes = computeNetWorkMinutes(grossMinutes, breakMinutes);
      return {
        date: day.date,
        dayLabel: day.dayLabel,
        totalMinutes: netMinutes,
        totalFormatted: formatDuration(netMinutes),
        grossMinutes,
        breakMinutes,
        dailyTargetMet: isDailyWorkQuotaMet(netMinutes),
        isToday: day.isToday,
      };
    });

    const todayGrossMinutes = sessionSnap.dailyBreakdown.find((d) => d.isToday)?.totalMinutes ?? 0;
    const todayBreakMinutes = attendanceSnap.todayBreakMinutes ?? 0;
    const breakToday = await this.breakPunchesService.getToday(userId);
    const onBreak = Boolean(breakToday.activeType);
    const todayBreakMinutesCompleted =
      breakToday.tea.usedMinutesCompleted +
      breakToday.lunch.usedMinutesCompleted +
      breakToday.meeting.usedMinutesCompleted;
    const todayBreakMinutesLive =
      breakToday.tea.usedMinutes +
      breakToday.lunch.usedMinutes +
      breakToday.meeting.usedMinutes;
    const breaksForLiveNet = onBreak ? todayBreakMinutesLive : todayBreakMinutes;
    const todayMinutes = computeNetWorkMinutes(todayGrossMinutes, breaksForLiveNet);
    const todayMinutesAtTarget = computeNetWorkMinutes(todayGrossMinutes, todayBreakMinutes);
    const monthlyMinutes = dailyBreakdown.reduce((sum, row) => sum + row.totalMinutes, 0);

    const isTimerRunning = Boolean(sessionSnap.currentSession);
    const currentSession = sessionSnap.currentSession;
    const todayDateKey =
      sessionSnap.dailyBreakdown.find((d) => d.isToday)?.date ?? calendarDateKey(now);
    const todayAuth = buildAuthBoundaryForDay(
      logs as unknown as ActivityLogRow[],
      todayDateKey,
      now,
      sessionId,
    );
    const todayAttRecord = await this.attendanceService.getDayAttendanceRecord(
      userId,
      todayDateKey,
    );
    const todaySessions = listSessionsForIstDay(
      logs as unknown as ActivityLogRow[],
      todayDateKey,
      now,
      sessionId,
    );

    return {
      period: attendanceSnap.period,
      monthlyMinutes,
      monthlyFormatted: formatDuration(monthlyMinutes),
      todayMinutes,
      todayFormatted: formatDuration(todayMinutes),
      todayMinutesAtTarget,
      todayGrossMinutes,
      todayBreakMinutes,
      todayBreakMinutesCompleted,
      onBreak,
      dailyTargetMinutes: DAILY_NET_WORK_TARGET_MINUTES,
      dailyBreakdown,
      currentSession,
      isTimerRunning,
      todayFirstLoginTime:
        todayAttRecord?.eodClosed && todayAttRecord.checkInTime
          ? formatTime12h(formatStoredTime(new Date(todayAttRecord.checkInTime)))
          : todayAuth.firstLoginAt
            ? formatIstTime12h(todayAuth.firstLoginAt)
            : undefined,
      todayLastLogoutTime:
        todayAttRecord?.eodClosed && todayAttRecord.checkOutTime
          ? formatTime12h(formatStoredTime(new Date(todayAttRecord.checkOutTime)))
          : todayAuth.lastLogoutAt
            ? formatIstTime12h(todayAuth.lastLogoutAt)
            : undefined,
      isOnDuty: todayAttRecord?.eodClosed ? false : todayAuth.onDuty,
      todaySessions,
    };
  }

  /** Bulk monthly work time for attendance / admin views. */
  async getTeamWorkTime(userIds: string[], year: number, month: number) {
    if (!year || !month) {
      throw new BadRequestException('year and month are required');
    }
    const sorted = [...userIds].sort();
    return this.cache.wrap(
      `act:team-worktime:${year}-${month}:${stableHash(sorted)}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.loadTeamWorkTime(sorted, year, month),
    );
  }

  private async loadTeamWorkTime(userIds: string[], year: number, month: number) {
    const uniqueIds = [...new Set(userIds.filter((id) => Types.ObjectId.isValid(id)))];
    return this.attendanceService.getTeamWorkTimeFromAttendance(uniqueIds, year, month);
  }
}
