import {
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  Min,
} from 'class-validator';

export class CreateBatchDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsArray() @IsString({ each: true })
  headers: string[];

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
}
