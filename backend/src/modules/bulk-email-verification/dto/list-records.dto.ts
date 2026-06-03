import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Query strings like "false" must not become true via Boolean("false"). */
function queryBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return undefined;
}
import { EmailVerificationStatus } from '../bulk-email-verification.constants';

export class ListEmailVerificationRecordsDto {
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

  @IsOptional()
  @IsEnum(EmailVerificationStatus)
  status?: EmailVerificationStatus;

  /** Comma-separated: valid,likely_valid,catch_all */
  @IsOptional()
  @IsString()
  statuses?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @Transform(({ value }) => queryBoolean(value))
  @IsBoolean()
  validOnly?: boolean;
}
