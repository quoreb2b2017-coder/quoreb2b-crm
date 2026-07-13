import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class InitiateMasterImportPresignDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contentType?: string;

  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: 'append' | 'replace';
}
