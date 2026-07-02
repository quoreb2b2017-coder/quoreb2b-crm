import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportMasterDataFileDto {
  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: 'append' | 'replace';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sheetName?: string;
}
