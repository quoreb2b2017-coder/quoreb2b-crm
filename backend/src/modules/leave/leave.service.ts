import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Leave } from './schemas/leave.schema';
import { ApplyLeaveDto, LeaveQueryDto } from './dto/leave.dto';

@Injectable()
export class LeaveService {
  constructor(@InjectModel(Leave.name) private leaveModel: Model<Leave>) {}

  async applyLeave(dto: ApplyLeaveDto) {
    const leave = new this.leaveModel({
      userId: new Types.ObjectId(dto.userId),
      leaveType: dto.leaveType,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      numberOfDays: dto.numberOfDays,
      reason: dto.reason,
      status: 'pending',
    });

    return leave.save();
  }

  async getLeaveApplications(dto: LeaveQueryDto) {
    const query: any = {};

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

  async approveLeave(leaveId: string, approvedBy: string) {
    return this.leaveModel.findByIdAndUpdate(
      leaveId,
      {
        status: 'approved',
        approvedBy: new Types.ObjectId(approvedBy),
        approvalDate: new Date(),
      },
      { new: true },
    );
  }

  async rejectLeave(leaveId: string, rejectionReason: string) {
    return this.leaveModel.findByIdAndUpdate(
      leaveId,
      {
        status: 'rejected',
        rejectionReason,
      },
      { new: true },
    );
  }

  async getUserLeaves(userId: string, status?: string) {
    const query: any = { userId: new Types.ObjectId(userId) };

    if (status) {
      query.status = status;
    }

    return this.leaveModel
      .find(query)
      .sort({ startDate: -1 });
  }

  async getLeaveBalance(userId: string, year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const approvedLeaves = await this.leaveModel.find({
      userId: new Types.ObjectId(userId),
      status: 'approved',
      startDate: { $gte: startDate, $lte: endDate },
    });

    const totalDaysUsed = approvedLeaves.reduce((sum, leave) => sum + leave.numberOfDays, 0);

    return {
      year,
      totalDaysUsed,
      remainingDays: Math.max(0, 30 - totalDaysUsed),
      approvedLeaves: approvedLeaves.length,
    };
  }
}
