import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMasterDataUploadRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sheetName: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  headers: string[];

  @IsArray()
  @ArrayMaxSize(50000)
  @IsArray({ each: true })
  rows: string[][];
}

export class ListMasterDataUploadRequestsDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}

export class ReviewMasterDataUploadRequestDto {
  @IsIn(['approved', 'rejected'])
  status: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason?: string;
}
