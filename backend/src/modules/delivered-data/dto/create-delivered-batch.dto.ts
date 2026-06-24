import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSuppressionBatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMaxSize(50000)
  suppressionSourceRowIndices: number[];

  /** VOIP / GPS / Email — auto-detected from name when omitted */
  @IsOptional()
  @IsIn(['voip', 'gps', 'email', 'other'])
  campaignChannel?: 'voip' | 'gps' | 'email' | 'other';
}
