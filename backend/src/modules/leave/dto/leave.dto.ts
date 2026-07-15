import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ApplyLeaveDto {
  @IsMongoId()
  userId: string;

  /** Employees only choose type of leave — Super Admin decides paid/unpaid on approve */
  @IsEnum(['sick', 'casual'])
  leaveType: 'sick' | 'casual';

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  numberOfDays?: number;

  @IsString()
  @MinLength(3)
  reason: string;
}

export class LeaveQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;
}

export class ApproveLeaveDto {
  /** Super Admin decides: paid leave (uses allowance) or unpaid (LOP) */
  @IsEnum(['paid', 'unpaid'])
  payMode: 'paid' | 'unpaid';
}

export class RejectLeaveDto {
  @IsString()
  @MinLength(1)
  rejectionReason: string;
}
