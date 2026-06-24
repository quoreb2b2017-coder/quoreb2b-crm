import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CheckSuppressionDto {
  @IsMongoId()
  suppressionCampaignId: string;

  @IsIn(['domain', 'email'])
  checkMode: 'domain' | 'email';

  /** Check rows from employee My Data file */
  @IsOptional()
  @IsMongoId()
  sourceRequestId?: string;

  /** Check rows from employee campaign batch */
  @IsOptional()
  @IsMongoId()
  sourceBatchId?: string;

  /** Inline rows (e.g. DB admin master extract before campaign create) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceHeaders?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000)
  sourceRows?: string[][];

  /** Optional manual domain/email values (newline or comma separated) */
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  manualInput?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseFileName?: string;
}
