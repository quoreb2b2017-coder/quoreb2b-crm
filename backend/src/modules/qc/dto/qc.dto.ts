import {
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { QC_CAMPAIGN_CHANNELS, QC_DECISIONS } from '../qc.constants';

export class QcListQueryDto {
  @IsOptional() @IsInt() @Min(2000)
  year?: number;

  @IsOptional() @IsInt() @Min(1)
  month?: number;

  @IsOptional() @IsIn(QC_CAMPAIGN_CHANNELS)
  channel?: string;

  @IsOptional() @IsIn(['pending', 'merged', 'rejected'])
  state?: string;

  @IsOptional() @IsMongoId()
  employeeId?: string;

  @IsOptional() @IsMongoId()
  rootBatchId?: string;
}

export class QcMergeDto {
  @IsArray()
  @IsMongoId({ each: true })
  entryIds: string[];

  @IsIn(QC_CAMPAIGN_CHANNELS)
  channel: string;

  @IsInt() @Min(2000)
  year: number;

  @IsInt() @Min(1)
  month: number;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;
}

export class QcRejectDto {
  @IsArray()
  @IsMongoId({ each: true })
  entryIds: string[];
}

export class QcDecisionDto {
  @IsMongoId()
  entryId: string;

  @IsIn(QC_DECISIONS)
  decision: string;
}
