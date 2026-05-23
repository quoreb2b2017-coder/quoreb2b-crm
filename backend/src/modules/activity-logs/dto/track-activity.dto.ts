import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackActivityDto {
  @IsString()
  @MaxLength(64)
  action: string;

  @IsString()
  @MaxLength(128)
  resource: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  resourceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
