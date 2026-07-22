import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SearchMasterDataDto } from '../../master-data/dto/search-master-data.dto';

export class CreateBatchDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ValidateIf((o: CreateBatchDto) => !o.masterSearchFilter && !(o.masterSourceRowIndices?.length))
  @IsArray() @IsString({ each: true })
  headers: string[];

  @ValidateIf((o: CreateBatchDto) => !o.masterSearchFilter && !(o.masterSourceRowIndices?.length))
  @IsArray() @ArrayMaxSize(50000) @IsArray({ each: true })
  rows: string[][];

  @IsOptional() @IsString()
  sourceFileName?: string;

  /** Required for db_admin: admin batch id this data was derived from */
  @IsOptional() @IsMongoId()
  sourceBatchId?: string;

  /** Master data row indices included in this batch (admin upload flow) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000)
  @IsInt({ each: true })
  @Min(0, { each: true })
  masterSourceRowIndices?: number[];

  /** Resolve rows server-side from master-data search filters (all matches or subset indices) */
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchMasterDataDto)
  masterSearchFilter?: SearchMasterDataDto;

  /** Parent batch row indices when creating a filtered sub-batch from sourceBatchId */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000)
  @IsInt({ each: true })
  @Min(0, { each: true })
  parentSourceRowIndices?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignChannel?: string;
}

export class ShareBatchDto {
  @IsArray() @IsString({ each: true })
  userIds: string[];
}

export class UpdateBatchDto {
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  headers?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(50000) @IsArray({ each: true })
  rows?: string[][];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignChannel?: string;

  /** Parallel to headers — true = existing/locked column */
  @IsOptional()
  @IsArray()
  @IsBoolean({ each: true })
  columnLocks?: boolean[];

  /** Parallel to rows — true = existing/locked row */
  @IsOptional()
  @IsArray()
  @IsBoolean({ each: true })
  rowLocks?: boolean[];

  /** First N / count of locked rows (compat) */
  @IsOptional()
  @IsInt()
  @Min(0)
  lockedRowCount?: number;
}
