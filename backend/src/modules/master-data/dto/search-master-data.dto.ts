import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MasterDataColumnFilterDto {
  @IsString()
  @IsNotEmpty()
  header: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsOptional()
  @IsIn(['contains', 'equals', 'startsWith'])
  match?: 'contains' | 'equals' | 'startsWith';
}

export class MasterDataColumnValuesFilterDto {
  @IsString()
  @IsNotEmpty()
  header: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  values: string[];
}

export class MasterDataColumnValuesOrFilterDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  headers: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  values: string[];
}

export class MasterDataColumnDateRangeFilterDto {
  @IsString()
  @IsNotEmpty()
  header: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class MasterDataAdvancedFiltersDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  subIndustry?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsOptional()
  @IsString()
  technology?: string;

  @IsOptional()
  @IsString()
  campaign?: string;

  @IsOptional()
  @IsString()
  leadStatus?: string;

  @IsOptional()
  @IsString()
  foundedFrom?: string;

  @IsOptional()
  @IsString()
  foundedTo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeRanges?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  revenueRanges?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companyTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interestedIn?: string[];

  @IsOptional()
  @IsBoolean()
  hasEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  hasPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  hasLinkedIn?: boolean;

  @IsOptional()
  @IsBoolean()
  hasWebsite?: boolean;

  @IsOptional()
  @IsBoolean()
  hasDecisionMaker?: boolean;
}

export class SearchMasterDataDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MasterDataColumnFilterDto)
  columnFilters?: MasterDataColumnFilterDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MasterDataColumnValuesFilterDto)
  columnValueFilters?: MasterDataColumnValuesFilterDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MasterDataColumnValuesOrFilterDto)
  columnValueOrFilters?: MasterDataColumnValuesOrFilterDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MasterDataColumnDateRangeFilterDto)
  columnDateRangeFilters?: MasterDataColumnDateRangeFilterDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  mustExistColumns?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MasterDataAdvancedFiltersDto)
  filters?: MasterDataAdvancedFiltersDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  /** Limit matches to rows not yet in a campaign, or only rows already campaigned. */
  @IsOptional()
  @IsIn(['all', 'remaining', 'in_campaign'])
  availabilityFilter?: 'all' | 'remaining' | 'in_campaign';
}
