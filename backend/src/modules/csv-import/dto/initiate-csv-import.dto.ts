import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CsvImportMode } from '../csv-import.types';

export class InitiateCsvImportDto {
  @IsString()
  fileName: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  fileSizeBytes: number;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsEnum(['replace', 'append'])
  mode: CsvImportMode;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(2000)
  batchSize?: number;
}

export class StartCsvImportDto {
  @IsOptional()
  @IsString()
  contentHash?: string;
}
