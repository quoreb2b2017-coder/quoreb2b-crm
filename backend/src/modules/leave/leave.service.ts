import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Leave } from './schemas/leave.schema';
import { ApplyLeaveDto, LeaveQueryDto } from './dto/leave.dto';
import { User } from '../users/schemas/user.schema';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { AttendanceService } from '../attendance/attendance.service';
import { Attendance } from '../attendance/schemas/attendance.schema';
import { ANNUAL_PAID_LEAVE_ALLOWANCE } from './leave-balance.constants';
import { parseDateOnly, toDateKey } from '../attendance/attendance-date.util';
import {
  calendarYearBounds,
  countWeekdaysBetween,
  weekdayDateKeysBetween,
  yearFromDateKey,
} from './leave-balance.util';
import { SystemRole } from '../../common/constants/roles.constant';

@Injectable()
export class LeaveService {
  constructor(
    @InjectModel(Leave.name) private leaveModel: Model<Leave>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    private notifications: NotificationTriggerService,
    private attendanceService: AttendanceService,
  ) {}

  private async countPaidLeaveUsedInYear(userId: string, year: number): Promise<number> {
    const { start, end } = calendarYearBounds(year);

    const fromAttendance = await this.attendanceModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: 'leave',
      isPaidLeave: true,
      date: { $gte: start, $lte: end },
    });

    const approvedLeaves = await this.leaveModel.find({
      userId: new Types.ObjectId(userId),
      status: 'approved',
      paidDaysApplied: { $gt: 0 },
      startDate: { $lte: end },
      endDate: { $gte: start },
    });

    let fromApproved = 0;
    for (const leave of approvedLeaves) {
      const startKey = toDateKey(leave.startDate);
      const endKey = toDateKey(leave.endDate);
      if (yearFromDateKey(startKey) === year && yearFromDateKey(endKey) === year) {
        fromApproved += leave.paidDaysApplied ?? 0;
      }
    }

    return Math.max(fromAttendance, fromApproved);
  }

  async getLeaveBalance(userId: string, year: number) {
    const paidDaysUsed = await this.countPaidLeaveUsedInYear(userId, year);
    const paidDaysRemaining = Math.max(0, ANNUAL_PAID_LEAVE_ALLOWANCE - paidDaysUsed);

    const { start, end } = calendarYearBounds(year);
    const approvedLeaves = await this.leaveModel.find({
      userId: new Types.ObjectId(userId),
      status: 'approved',
      startDate: { $lte: end },
      endDate: { $gte: start },
    });

    const unpaidDaysUsed = approvedLeaves.reduce(
      (sum, leave) => sum + (leave.unpaidDaysApplied ?? 0),
      0,
    );

    return {
      year,
      allowance: ANNUAL_PAID_LEAVE_ALLOWANCE,
      periodLabel: `January – December ${year}`,
      paidDaysUsed,
      paidDaysRemaining,
      unpaidDaysUsed,
      approvedLeaveCount: approvedLeaves.length,
      /** @deprecated use paidDaysRemaining */
      remainingDays: paidDaysRemaining,
      /** @deprecated use paidDaysUsed */
      totalDaysUsed: paidDaysUsed,
      approvedLeaves: approvedLeaves.length,
    };
  }

  async getLeaveBalancesForUsers(
    requesterId: string,
    requesterRoles: string[],
    year: number,
    requestedUserIds: string[] = [],
  ) {
    const isOrgViewer = requesterRoles.some((r) =>
      ['super_admin', 'admin', 'db_admin'].includes(r),
    );

    let userIds = requestedUserIds.filter(Boolean);
    if (!isOrgViewer) {
      userIds = [requesterId];
    } else if (userIds.length === 0) {
      userIds = [requesterId];
    }

    const uniqueIds = [...new Set(userIds)].slice(0, 500);
    const users = await Promise.all(
      uniqueIds.map(async (userId) => {
        const balance = await this.getLeaveBalance(userId, year);
        return { userId, ...balance };
      }),
    );

    const allowanceTotal = users.length * ANNUAL_PAID_LEAVE_ALLOWANCE;
    const paidDaysUsedTotal = users.reduce((sum, row) => sum + row.paidDaysUsed, 0);
    const paidDaysRemainingTotal = users.reduce((sum, row) => sum + row.paidDaysRemaining, 0);
    const unpaidDaysUsedTotal = users.reduce((sum, row) => sum + row.unpaidDaysUsed, 0);

    return {
      year,
      allowancePerUser: ANNUAL_PAID_LEAVE_ALLOWANCE,
      periodLabel: `January – December ${year}`,
      users,
      totals: {
        userCount: users.length,
        allowanceTotal,
        paidDaysUsedTotal,
        paidDaysRemainingTotal,
        unpaidDaysUsedTotal,
      },
    };
  }

  async applyLeave(dto: ApplyLeaveDto) {
    const weekdayCount = countWeekdaysBetween(dto.startDate, dto.endDate);
    if (weekdayCount === 0) {
      throw new BadRequestException('Leave range has no weekdays (weekends only)');
    }

    // Paid vs unpaid is decided by Super Admin on approve — no balance gate at apply.
    const leave = new this.leaveModel({
      userId: new Types.ObjectId(dto.userId),
      leaveType: dto.leaveType,
      startDate: parseDateOnly(dto.startDate.slice(0, 10)),
      endDate: parseDateOnly(dto.endDate.slice(0, 10)),
      numberOfDays: weekdayCount,
      reason: dto.reason,
      status: 'pending',
      paidDaysApplied: 0,
      unpaidDaysApplied: 0,
    });

    const saved = await leave.save();
    const applicant = await this.userModel.findById(dto.userId).lean().exec();
    const applicantName = [applicant?.firstName, applicant?.lastName].filter(Boolean).join(' ').trim() || applicant?.email || 'Employee';

    try {
      await this.notifications.notifyLeaveApplied(
        dto.userId,
        applicantName,
        dto.leaveType,
        dto.startDate,
        dto.endDate,
      );
    } catch {
      /* notification should not block leave apply */
    }

    return saved;
  }

  async getLeaveApplications(dto: LeaveQueryDto) {
    const query: Record<string, unknown> = {};

    if (dto.status) {
      query.status = dto.status;
    }

    if (dto.userId) {
      query.userId = new Types.ObjectId(dto.userId);
    }

    const page = dto.page || 1;
    const limit = dto.limit || 50;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.leaveModel
        .find(query)
        .populate('userId', 'firstName lastName email employeeId')
        .populate('approvedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.leaveModel.countDocuments(query),
    ]);

    return {
      records,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  private async syncApprovedLeaveToAttendance(
    leave: Leave,
    payMode: 'paid' | 'unpaid',
  ) {
    const userId = leave.userId.toString();
    const weekdayKeys = weekdayDateKeysBetween(
      toDateKey(leave.startDate),
      toDateKey(leave.endDate),
    );

    const paidKeys: string[] = [];
    const unpaidKeys: string[] = [];
    const remainingByYear = new Map<number, number>();

    for (const dateKey of weekdayKeys) {
      const year = yearFromDateKey(dateKey);
      if (payMode === 'unpaid') {
        unpaidKeys.push(dateKey);
        continue;
      }

      if (!remainingByYear.has(year)) {
        const balance = await this.getLeaveBalance(userId, year);
        remainingByYear.set(year, balance.paidDaysRemaining);
      }

      const remaining = remainingByYear.get(year) ?? 0;
      if (remaining > 0) {
        paidKeys.push(dateKey);
        remainingByYear.set(year, remaining - 1);
      } else {
        // Balance exhausted — remaining days fall to unpaid automatically
        unpaidKeys.push(dateKey);
      }
    }

    if (paidKeys.length) {
      await this.attendanceService.markApprovedLeaveDays(userId, paidKeys, true);
    }
    if (unpaidKeys.length) {
      await this.attendanceService.markApprovedLeaveDays(userId, unpaidKeys, false);
    }

    return { paidDaysApplied: paidKeys.length, unpaidDaysApplied: unpaidKeys.length };
  }

  async approveLeave(
    leaveId: string,
    approvedBy: string,
    payMode: 'paid' | 'unpaid',
    actorRoles: string[] = [],
  ) {
    const isSuperAdmin =
      actorRoles.includes(SystemRole.SUPER_ADMIN) ||
      actorRoles.includes(SystemRole.ADMIN);
    if (!isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can approve leave and choose paid/unpaid');
    }

    const existing = await this.leaveModel.findById(leaveId).exec();
    if (!existing) {
      throw new BadRequestException('Leave request not found');
    }
    if (existing.status !== 'pending') {
      throw new BadRequestException('Only pending leave requests can be approved');
    }

    if (payMode === 'paid') {
      const years = new Set(
        weekdayDateKeysBetween(
          toDateKey(existing.startDate),
          toDateKey(existing.endDate),
        ).map((k) => yearFromDateKey(k)),
      );
      for (const year of years) {
        const balance = await this.getLeaveBalance(existing.userId.toString(), year);
        const daysInYear = weekdayDateKeysBetween(
          toDateKey(existing.startDate),
          toDateKey(existing.endDate),
        ).filter((key) => yearFromDateKey(key) === year).length;
        if (daysInYear > balance.paidDaysRemaining) {
          throw new BadRequestException(
            `Only ${balance.paidDaysRemaining} paid leave day(s) remaining for ${year}. Approve as Unpaid, or choose a shorter range.`,
          );
        }
      }
    }

    const { paidDaysApplied, unpaidDaysApplied } =
      await this.syncApprovedLeaveToAttendance(existing, payMode);

    const leave = await this.leaveModel.findByIdAndUpdate(
      leaveId,
      {
        status: 'approved',
        approvedBy: new Types.ObjectId(approvedBy),
        approvalDate: new Date(),
        payMode,
        paidDaysApplied,
        unpaidDaysApplied,
        numberOfDays: paidDaysApplied + unpaidDaysApplied,
      },
      { new: true },
    );

    if (leave) {
      const [applicant, approver] = await Promise.all([
        this.userModel.findById(leave.userId).lean().exec(),
        this.userModel.findById(approvedBy).lean().exec(),
      ]);
      const applicantName = [applicant?.firstName, applicant?.lastName].filter(Boolean).join(' ').trim() || applicant?.email || 'Employee';
      const approverName = [approver?.firstName, approver?.lastName].filter(Boolean).join(' ').trim() || approver?.email || 'Admin';
      try {
        await this.notifications.notifyLeaveApproved(
          leave.userId.toString(),
          applicantName,
          leave.leaveType,
          toDateKey(leave.startDate),
          toDateKey(leave.endDate),
          approverName,
        );
      } catch {
        /* notification should not block leave approval */
      }

      const balanceYear = yearFromDateKey(toDateKey(leave.startDate));
      const balance = await this.getLeaveBalance(leave.userId.toString(), balanceYear);

      return {
        leave,
        applicantUserId: leave.userId.toString(),
        paidDaysApplied,
        unpaidDaysApplied,
        payMode,
        balance,
      };
    }
    return { leave, paidDaysApplied, unpaidDaysApplied, payMode };
  }

  async rejectLeave(leaveId: string, rejectionReason: string) {
    const leave = await this.leaveModel.findByIdAndUpdate(
      leaveId,
      {
        status: 'rejected',
        rejectionReason,
      },
      { new: true },
    );
    if (leave) {
      const applicant = await this.userModel.findById(leave.userId).lean().exec();
      const applicantName = [applicant?.firstName, applicant?.lastName].filter(Boolean).join(' ').trim() || applicant?.email || 'Employee';
      try {
        await this.notifications.notifyLeaveRejected(
          leave.userId.toString(),
          applicantName,
          leave.leaveType,
          new Date(leave.startDate).toISOString().slice(0, 10),
          new Date(leave.endDate).toISOString().slice(0, 10),
          rejectionReason,
        );
      } catch {
        /* notification should not block leave rejection */
      }
    }
    return leave;
  }

  async getUserLeaves(userId: string, status?: string) {
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

    if (status) {
      query.status = status;
    }

    return this.leaveModel.find(query).sort({ startDate: -1 });
  }
}
