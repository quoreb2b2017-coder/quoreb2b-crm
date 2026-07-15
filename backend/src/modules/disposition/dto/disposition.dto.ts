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
  @IsEnum(['do_not_call', 'direct_voicemail'])
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
