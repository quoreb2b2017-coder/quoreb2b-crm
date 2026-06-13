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

  @IsEnum(['sick', 'casual', 'earned', 'unpaid'])
  leaveType: 'sick' | 'casual' | 'earned' | 'unpaid';

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
  @IsMongoId()
  approvedBy: string;
}

export class RejectLeaveDto {
  @IsString()
  @MinLength(1)
  rejectionReason: string;
}
