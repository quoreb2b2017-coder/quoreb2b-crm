import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SearchMasterDataDto } from '../../master-data/dto/search-master-data.dto';

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

  /** Resolve master rows server-side (DB admin extract with server search) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000)
  @IsInt({ each: true })
  @Min(0, { each: true })
  masterSourceRowIndices?: number[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchMasterDataDto)
  masterSearchFilter?: SearchMasterDataDto;

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
