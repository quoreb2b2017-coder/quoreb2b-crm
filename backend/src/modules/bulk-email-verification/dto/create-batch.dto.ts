import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ProspectRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;
}

export class CreateEmailVerificationBatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100_000)
  @ValidateNested({ each: true })
  @Type(() => ProspectRowDto)
  rows!: ProspectRowDto[];
}
