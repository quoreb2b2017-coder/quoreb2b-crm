import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SaveMasterDataDto {
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
  @ArrayMaxSize(1000000)
  @IsArray({ each: true })
  rows: string[][];

  /** append = add to existing master data (default); replace = overwrite all */
  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: 'append' | 'replace';
}
