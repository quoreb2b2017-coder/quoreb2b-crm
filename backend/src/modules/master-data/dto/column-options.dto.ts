import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class MasterDataColumnOptionsQueryDto {
  @IsString()
  @IsNotEmpty()
  header: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}
