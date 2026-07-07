import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  search?: string;

  /** Keyset cursor — ISO date or ObjectId string of last item from previous page */
  @IsOptional()
  @IsString()
  cursor?: string;
}

export function paginate<T>(items: T[], total: number, dto: PaginationDto) {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 20;
  return {
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
}

export interface CursorPageMeta {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
  /** Total count omitted on deep pages when skipCount=true */
  total?: number;
}

export function paginateCursor<T>(
  items: T[],
  dto: PaginationDto,
  nextCursor: string | null,
  total?: number,
): { data: T[]; meta: CursorPageMeta } {
  const limit = dto.limit ?? 20;
  return {
    data: items,
    meta: {
      limit,
      hasNextPage: items.length === limit,
      nextCursor,
      ...(total !== undefined ? { total } : {}),
    },
  };
}
