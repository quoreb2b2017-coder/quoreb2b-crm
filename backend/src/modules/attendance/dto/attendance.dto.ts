import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MarkAttendanceDto {
  @IsMongoId()
  userId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsEnum(['present', 'absent', 'leave', 'half-day', 'weekend'])
  status: 'present' | 'absent' | 'leave' | 'half-day' | 'weekend';

  /** HH:mm (optional, for present / half-day) */
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  checkInTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  checkOutTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hoursWorked?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPaidLeave?: boolean;
}

export class AttendanceQueryDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['present', 'absent', 'leave', 'half-day', 'weekend'])
  status?: string;

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

export class AttendanceAnalyticsDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;
}
