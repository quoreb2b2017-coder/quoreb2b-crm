import { IsEnum, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DispositionKind } from '../disposition.constants';

export class DispositionListQueryDto {
  @IsOptional()
  @IsEnum(['do_not_call', 'direct_voicemail'])
  kind?: DispositionKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  @IsOptional()
  @IsMongoId()
  rootBatchId?: string;
}
