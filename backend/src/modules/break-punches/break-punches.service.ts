import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BreakPunch } from './schemas/break-punch.schema';
import { MeetingBreakRequest } from './schemas/meeting-break-request.schema';
import { BREAK_LIMITS, BREAK_TYPES, WORK_DEDUCTIBLE_BREAK_TYPES, type BreakType } from './break-punch.constants';
import { dateKeyFromUtcDate, todayDateUtc, todayDateKeyIst } from './break-punch-date.util';
import { AppCacheService } from '../../redis/app-cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../../events/events.gateway';
import { User } from '../users/schemas/user.schema';
import { SystemRole } from '../../common/constants/roles.constant';

export interface BreakSessionDto {
  id: string;
  type: BreakType;
  slotIndex: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  limitMinutes: number;
  exceededLimit: boolean;
  isActive: boolean;
}

export interface BreakTypeStatusDto {
  label: string;
  hint: string;
  dailyBudgetMinutes: number;
  usedMinutes: number;
  usedMinutesCompleted: number;
  remainingMinutes: number;
  remainingSeconds: number;
  punchCount: number;
  canStart: boolean;
  isActive: boolean;
  activeElapsedSeconds: number;
  sessions: BreakSessionDto[];
}

export interface MeetingRequestDto {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedAt: string;
  reviewedAt: string | null;
}

export interface PendingMeetingRequestAdminDto {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedAt: string;
}

export interface BreakPunchTodayDto {
  date: string;
  activeType: BreakType | null;
  tea: BreakTypeStatusDto;
  lunch: BreakTypeStatusDto;
  meeting: BreakTypeStatusDto;
  meetingRequest: MeetingRequestDto | null;
}

@Injectable()
export class BreakPunchesService {
  constructor(
    @InjectModel(BreakPunch.name) private readonly breakModel: Model<BreakPunch>,
    @InjectModel(MeetingBreakRequest.name)
    private readonly meetingRequestModel: Model<MeetingBreakRequest>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly cache: AppCacheService,
    private readonly notificationsService: NotificationsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  private requiresMeetingApproval(roles: string[] = []): boolean {
    if (roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN)) {
      return false;
    }
    return roles.includes(SystemRole.EMPLOYEE) || roles.includes(SystemRole.DB_ADMIN);
  }

  /** Sum break minutes per IST date key (default: all types; pass WORK_DEDUCTIBLE_BREAK_TYPES for net work). */
  async getBreakMinutesByDateForUser(
    userId: string,
    start: Date,
    end: Date,
    periodEnd: Date = new Date(),
    completedOnly = false,
    types: BreakType[] = [...BREAK_TYPES],
  ): Promise<Map<string, number>> {
    const records = await this.breakModel
      .find({
        userId: new Types.ObjectId(userId),
        date: { $gte: start, $lte: end },
      })
      .sort({ startedAt: 1 })
      .lean()
      .exec();

    const byDate = new Map<string, typeof records>();
    for (const r of records) {
      const key = dateKeyFromUtcDate(r.date);
      const list = byDate.get(key) ?? [];
      list.push(r);
      byDate.set(key, list);
    }

    const now = periodEnd.getTime();
    const result = new Map<string, number>();

    for (const [dateKey, sessions] of byDate) {
      const activeOnDate = sessions.find((s) => !s.endedAt) ?? null;
      let total = 0;
      for (const type of types) {
        const status = this.buildTypeStatus(type, sessions, activeOnDate, now);
        total += completedOnly ? status.usedMinutesCompleted : status.usedMinutes;
      }
      result.set(dateKey, total);
    }

    return result;
  }

  private async invalidateWorkTimeCaches(userId: string) {
    await Promise.all([
      this.cache.delByPrefix(`act:worktime:${userId}:`),
      this.cache.delByPrefix('att:analytics:'),
    ]);
  }

  /** Close open breaks when budget is used up or the IST day has rolled over (runs while logged out). */
  async syncActiveBreakSessions(userId: string): Promise<void> {
    const actives = await this.breakModel
      .find({
        userId: new Types.ObjectId(userId),
        $or: [{ endedAt: { $exists: false } }, { endedAt: null }],
      })
      .exec();

    if (!actives.length) return;

    const todayKey = todayDateKeyIst();
    let changed = false;

    for (const active of actives) {
      const type = active.type as BreakType;
      const limits = BREAK_LIMITS[type];
      const completedUsed = await this.sumCompletedMinutes(userId, active.date, type);
      const remainingAtSessionStart = Math.max(
        0,
        limits.dailyBudgetMinutes - completedUsed,
      );
      const sessionDayKey = dateKeyFromUtcDate(active.date);
      const elapsedMinutes = Math.max(
        0,
        Math.round((Date.now() - active.startedAt.getTime()) / 60_000),
      );

      if (sessionDayKey !== todayKey || elapsedMinutes >= remainingAtSessionStart) {
        await this.endBreak(active, remainingAtSessionStart);
        changed = true;
      }
    }

    if (changed) {
      await this.invalidateWorkTimeCaches(userId);
    }
  }

  async getToday(userId: string): Promise<BreakPunchTodayDto> {
    await this.syncActiveBreakSessions(userId);
    const date = todayDateUtc();
    const records = await this.breakModel
      .find({ userId: new Types.ObjectId(userId), date })
      .sort({ startedAt: 1 })
      .lean()
      .exec();

    const now = Date.now();
    const active = records.find((r) => !r.endedAt) ?? null;

    const meetingRequest = await this.meetingRequestModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date,
        status: { $in: ['pending', 'approved', 'rejected'] },
      })
      .sort({ requestedAt: -1 })
      .lean()
      .exec();

    return {
      date: todayDateKeyIst(),
      activeType: active ? (active.type as BreakType) : null,
      tea: this.buildTypeStatus('tea', records, active, now),
      lunch: this.buildTypeStatus('lunch', records, active, now),
      meeting: this.buildTypeStatus('meeting', records, active, now),
      meetingRequest: meetingRequest
        ? {
            id: String(meetingRequest._id),
            status: meetingRequest.status,
            requestedAt: meetingRequest.requestedAt.toISOString(),
            reviewedAt: meetingRequest.reviewedAt
              ? meetingRequest.reviewedAt.toISOString()
              : null,
          }
        : null,
    };
  }

  async requestMeeting(
    userId: string,
    roles: string[] = [],
  ): Promise<BreakPunchTodayDto> {
    if (!this.requiresMeetingApproval(roles)) {
      return this.toggle(userId, 'meeting', roles);
    }

    const date = todayDateUtc();
    const active = await this.breakModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date,
        $or: [{ endedAt: { $exists: false } }, { endedAt: null }],
      })
      .exec();

    if (active) {
      throw new BadRequestException('End your current break before requesting a meeting.');
    }

    const pending = await this.meetingRequestModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date,
        status: 'pending',
      })
      .exec();

    if (pending) {
      throw new BadRequestException('Meeting request already pending admin approval.');
    }

    const records = await this.breakModel
      .find({ userId: new Types.ObjectId(userId), date, type: 'meeting' })
      .lean()
      .exec();
    const status = this.buildTypeStatus('meeting', records, null, Date.now());

    if (status.remainingMinutes <= 0) {
      throw new BadRequestException('Meeting time used up for today (60 min).');
    }

    const user = await this.userModel
      .findById(userId)
      .select('firstName lastName email')
      .lean()
      .exec();
    const userName = user
      ? `${user.firstName} ${user.lastName}`.trim()
      : 'Employee';

    const request = await this.meetingRequestModel.create({
      userId: new Types.ObjectId(userId),
      date,
      status: 'pending',
      requestedAt: new Date(),
    });

    await this.notifyAdminsOfMeetingRequest(userId, userName, user?.email ?? '', request._id);

    return this.getToday(userId);
  }

  async listPendingMeetingRequests(): Promise<PendingMeetingRequestAdminDto[]> {
    const date = todayDateUtc();
    const rows = await this.meetingRequestModel
      .find({ date, status: 'pending' })
      .sort({ requestedAt: 1 })
      .lean()
      .exec();

    const userIds = [...new Set(rows.map((r) => String(r.userId)))];
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('firstName lastName email')
      .lean()
      .exec();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    return rows.map((r) => {
      const u = userMap.get(String(r.userId));
      return {
        id: String(r._id),
        userId: String(r.userId),
        userName: u ? `${u.firstName} ${u.lastName}`.trim() : 'User',
        userEmail: u?.email ?? '',
        requestedAt: r.requestedAt.toISOString(),
      };
    });
  }

  async reviewMeetingRequest(
    adminId: string,
    requestId: string,
    action: 'approve' | 'reject',
  ): Promise<BreakPunchTodayDto> {
    const request = await this.meetingRequestModel.findById(requestId).exec();
    if (!request || request.status !== 'pending') {
      throw new NotFoundException('Meeting request not found or already reviewed.');
    }

    const employeeId = request.userId.toString();
    const now = new Date();

    if (action === 'reject') {
      request.status = 'rejected';
      request.reviewedBy = new Types.ObjectId(adminId);
      request.reviewedAt = now;
      await request.save();

      await this.notificationsService.create(employeeId, {
        title: 'Meeting request declined',
        message: 'Your meeting break request was not approved.',
        type: 'activity_alert',
      });
      this.eventsGateway.emitToUser(employeeId, 'meeting-request:updated', {
        requestId,
        status: 'rejected',
      });

      return this.getToday(employeeId);
    }

    const date = request.date;
    const active = await this.breakModel
      .findOne({
        userId: request.userId,
        date,
        $or: [{ endedAt: { $exists: false } }, { endedAt: null }],
      })
      .exec();

    if (active) {
      throw new BadRequestException('Employee already has an active break.');
    }

    const records = await this.breakModel
      .find({ userId: request.userId, date, type: 'meeting' })
      .lean()
      .exec();
    const status = this.buildTypeStatus('meeting', records, null, now.getTime());

    if (status.remainingMinutes <= 0) {
      throw new BadRequestException('Employee has no meeting time remaining today.');
    }

    const punch = await this.breakModel.create({
      userId: request.userId,
      date,
      type: 'meeting',
      startedAt: now,
      slotIndex: records.length + 1,
      durationMinutes: 0,
      exceededLimit: false,
    });

    request.status = 'approved';
    request.reviewedBy = new Types.ObjectId(adminId);
    request.reviewedAt = now;
    request.breakPunchId = punch._id;
    await request.save();

    await this.invalidateWorkTimeCaches(employeeId);

    await this.notificationsService.create(employeeId, {
      title: 'Meeting approved',
      message: 'Admin approved your meeting. Timer has started.',
      type: 'success',
    });
    this.eventsGateway.emitToUser(employeeId, 'meeting-request:updated', {
      requestId,
      status: 'approved',
    });

    return this.getToday(employeeId);
  }

  private async notifyAdminsOfMeetingRequest(
    requesterId: string,
    requesterName: string,
    requesterEmail: string,
    requestId: Types.ObjectId,
  ) {
    const admins = await this.userModel
      .find({
        isActive: true,
        roles: { $in: [SystemRole.ADMIN, SystemRole.SUPER_ADMIN] },
      })
      .select('_id')
      .lean()
      .exec();

    const title = 'Meeting break request';
    const message = `${requesterName} (${requesterEmail}) requested a meeting break.`;

    await Promise.all(
      admins.map(async (admin) => {
        const adminId = String(admin._id);
        await this.notificationsService.create(adminId, {
          title,
          message,
          type: 'activity_alert',
        });
        this.eventsGateway.emitToUser(adminId, 'meeting-request:pending', {
          requestId: String(requestId),
          requesterId,
          requesterName,
          requesterEmail,
        });
      }),
    );
  }

  async toggle(
    userId: string,
    type: BreakType,
    roles: string[] = [],
  ): Promise<BreakPunchTodayDto> {
    const date = todayDateUtc();
    const limits = BREAK_LIMITS[type];

    const active = await this.breakModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date,
        $or: [{ endedAt: { $exists: false } }, { endedAt: null }],
      })
      .exec();

    if (active && !active.endedAt) {
      if (active.type !== type) {
        throw new BadRequestException(
          `Please end your ${BREAK_LIMITS[active.type as BreakType].label} before starting another.`,
        );
      }
      const completedUsed = await this.sumCompletedMinutes(userId, date, type);
      const remainingAtSessionStart = limits.dailyBudgetMinutes - completedUsed;
      await this.endBreak(active, remainingAtSessionStart);
      return this.getToday(userId);
    }

    const records = await this.breakModel
      .find({ userId: new Types.ObjectId(userId), date, type })
      .lean()
      .exec();
    const status = this.buildTypeStatus(type, records, null, Date.now());

    if (status.remainingMinutes <= 0) {
      throw new BadRequestException(
        `${limits.label} time used up for today (${limits.dailyBudgetMinutes} min).`,
      );
    }

    if (type === 'meeting' && this.requiresMeetingApproval(roles)) {
      throw new BadRequestException(
        'Meeting requires admin approval. Tap Meeting to send a request.',
      );
    }

    const punchCount = records.length;
    await this.breakModel.create({
      userId: new Types.ObjectId(userId),
      date,
      type,
      startedAt: new Date(),
      slotIndex: punchCount + 1,
      durationMinutes: 0,
      exceededLimit: false,
    });

    await this.invalidateWorkTimeCaches(userId);
    return this.getToday(userId);
  }

  private async sumCompletedMinutes(
    userId: string,
    date: Date,
    type: BreakType,
  ): Promise<number> {
    const rows = await this.breakModel
      .find({
        userId: new Types.ObjectId(userId),
        date,
        type,
        endedAt: { $exists: true, $ne: null },
      })
      .lean()
      .exec();
    return rows.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0);
  }

  private buildTypeStatus(
    type: BreakType,
    allRecords: Array<{
      _id: Types.ObjectId;
      type: string;
      slotIndex?: number;
      startedAt: Date;
      endedAt?: Date;
      durationMinutes?: number;
      exceededLimit?: boolean;
    }>,
    globalActive: { type: string } | null,
    now: number,
  ): BreakTypeStatusDto {
    const limits = BREAK_LIMITS[type];
    const sessions = allRecords.filter((r) => r.type === type);
    const completed = sessions.filter((r) => r.endedAt);
    const activeSession = sessions.find((r) => !r.endedAt);

    const usedMinutesCompleted = completed.reduce(
      (sum, r) => sum + (r.durationMinutes ?? 0),
      0,
    );
    const poolRemainingBeforeActive = Math.max(
      0,
      limits.dailyBudgetMinutes - usedMinutesCompleted,
    );

    const activeElapsedSeconds = activeSession
      ? Math.max(0, Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000))
      : 0;

    const activeElapsedMinutes = activeSession
      ? Math.min(
          Math.ceil(activeElapsedSeconds / 60),
          poolRemainingBeforeActive,
        )
      : 0;

    const usedMinutes = usedMinutesCompleted + activeElapsedMinutes;
    const remainingMinutes = Math.max(0, limits.dailyBudgetMinutes - usedMinutes);
    const remainingSeconds = Math.max(
      0,
      limits.dailyBudgetMinutes * 60 - usedMinutesCompleted * 60 - activeElapsedSeconds,
    );

    const anyActive = !!globalActive;
    const canStart = !anyActive && remainingMinutes > 0;

    return {
      label: limits.label,
      hint: limits.hint,
      dailyBudgetMinutes: limits.dailyBudgetMinutes,
      usedMinutes,
      usedMinutesCompleted,
      remainingMinutes,
      remainingSeconds,
      punchCount: sessions.length,
      canStart,
      isActive: !!activeSession,
      activeElapsedSeconds,
      sessions: sessions.map((s) =>
        this.toSessionDto(s, limits.dailyBudgetMinutes, now),
      ),
    };
  }

  private async endBreak(record: BreakPunch, remainingAtSessionStart: number) {
    const endedAt = new Date();
    const rawMinutes = Math.max(
      0,
      Math.round((endedAt.getTime() - record.startedAt.getTime()) / 60_000),
    );
    const durationMinutes = Math.min(rawMinutes, Math.max(0, remainingAtSessionStart));

    record.endedAt = endedAt;
    record.durationMinutes = durationMinutes;
    record.exceededLimit = rawMinutes > remainingAtSessionStart;
    await record.save();
  }

  private toSessionDto(
    s: {
      _id: Types.ObjectId;
      type: string;
      slotIndex?: number;
      startedAt: Date;
      endedAt?: Date;
      durationMinutes?: number;
      exceededLimit?: boolean;
    },
    dailyBudgetMinutes: number,
    now: number,
  ): BreakSessionDto {
    const isActive = !s.endedAt;
    const durationMinutes = isActive
      ? Math.max(0, Math.round((now - new Date(s.startedAt).getTime()) / 60_000))
      : (s.durationMinutes ?? 0);

    return {
      id: String(s._id),
      type: s.type as BreakType,
      slotIndex: s.slotIndex ?? 1,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      durationMinutes,
      limitMinutes: dailyBudgetMinutes,
      exceededLimit: s.exceededLimit ?? false,
      isActive,
    };
  }
}
