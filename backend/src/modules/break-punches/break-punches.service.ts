import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BreakPunch } from './schemas/break-punch.schema';
import { BREAK_LIMITS, BREAK_TYPES, type BreakType } from './break-punch.constants';
import { dateKeyFromUtcDate, todayDateUtc, todayDateKeyIst } from './break-punch-date.util';
import { AppCacheService } from '../../redis/app-cache.service';

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

export interface BreakPunchTodayDto {
  date: string;
  activeType: BreakType | null;
  tea: BreakTypeStatusDto;
  lunch: BreakTypeStatusDto;
  meeting: BreakTypeStatusDto;
}

@Injectable()
export class BreakPunchesService {
  constructor(
    @InjectModel(BreakPunch.name) private readonly breakModel: Model<BreakPunch>,
    private readonly cache: AppCacheService,
  ) {}

  /** Sum tea + lunch + meeting minutes used per IST date key in range. */
  async getBreakMinutesByDateForUser(
    userId: string,
    start: Date,
    end: Date,
    periodEnd: Date = new Date(),
    completedOnly = false,
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
      for (const type of BREAK_TYPES) {
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

  async getToday(userId: string): Promise<BreakPunchTodayDto> {
    const date = todayDateUtc();
    const records = await this.breakModel
      .find({ userId: new Types.ObjectId(userId), date })
      .sort({ startedAt: 1 })
      .lean()
      .exec();

    const now = Date.now();
    const active = records.find((r) => !r.endedAt) ?? null;

    return {
      date: todayDateKeyIst(),
      activeType: active ? (active.type as BreakType) : null,
      tea: this.buildTypeStatus('tea', records, active, now),
      lunch: this.buildTypeStatus('lunch', records, active, now),
      meeting: this.buildTypeStatus('meeting', records, active, now),
    };
  }

  async toggle(userId: string, type: BreakType): Promise<BreakPunchTodayDto> {
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
