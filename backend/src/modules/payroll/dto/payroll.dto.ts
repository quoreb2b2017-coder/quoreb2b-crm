import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertCompensationDto {
  @IsString()
  @MinLength(1)
  userId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basicSalary: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hra?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  specialAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  conveyance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherAllowances?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pfDeduction?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  professionalTax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherDeductions?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ifscCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  panNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
}

export class GeneratePayslipDto {
  @IsString()
  @MinLength(1)
  userId: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class ListPayslipsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpdatePayrollBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  companyAddress?: string;

  /** Empty string allowed — class-validator IsEmail rejects "" otherwise */
  @ValidateIf((_, v) => typeof v === 'string' && v.trim().length > 0)
  @IsEmail()
  @IsOptional()
  companyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorizedSignatoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorizedSignatoryTitle?: string;

  /** Optional base64 data URL — keep under ~1.5MB */
  @IsOptional()
  @IsString()
  logoDataUrl?: string;

  @IsOptional()
  @IsString()
  signDataUrl?: string;

  @IsOptional()
  @IsString()
  stampDataUrl?: string;

  @IsOptional()
  @IsBoolean()
  clearLogo?: boolean;

  @IsOptional()
  @IsBoolean()
  clearSign?: boolean;

  @IsOptional()
  @IsBoolean()
  clearStamp?: boolean;
}
