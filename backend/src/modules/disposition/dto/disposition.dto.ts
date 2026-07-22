import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DispositionKind } from '../disposition.constants';

export class DispositionListQueryDto {
  @IsOptional()
  @IsEnum([
    'do_not_call',
    'direct_voicemail',
    'call_after_3_months',
    'call_after_6_months',
  ])
  kind?: DispositionKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  @IsOptional()
  @IsMongoId()
  rootBatchId?: string;
}

export class DeleteDispositionCampaignDto {
  @IsEnum([
    'do_not_call',
    'direct_voicemail',
    'call_after_3_months',
    'call_after_6_months',
  ])
  kind: DispositionKind;

  /** Tree campaign key without `camp-` prefix (rootBatchId or campaign name). */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  campaignKey: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}

export class CreateCallbackReminderDto {
  @IsMongoId()
  batchId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  rowIndex: number;

  @Type(() => Number)
  @IsIn([24, 48])
  hours: 24 | 48;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  leadLabel?: string;
}
