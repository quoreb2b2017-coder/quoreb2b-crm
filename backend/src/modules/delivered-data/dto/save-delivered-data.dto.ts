import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SaveSuppressionDataDto {
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

  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: 'append' | 'replace';
}

/** @deprecated alias */
export class SaveDeliveredDataDto extends SaveSuppressionDataDto {}
