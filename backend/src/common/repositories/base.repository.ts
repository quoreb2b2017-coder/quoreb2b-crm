import { Model, Document, FilterQuery, UpdateQuery } from 'mongoose';
import { PaginationDto, paginate, paginateCursor } from '../dto/pagination.dto';

export interface PaginateOptions {
  populate?: string | string[];
  select?: string;
  lean?: boolean;
}

export abstract class BaseRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create(data);
  }

  async update(id: string, data: UpdateQuery<T>): Promise<T | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async delete(id: string): Promise<T | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  async findPaginated(
    filter: FilterQuery<T>,
    dto: PaginationDto,
    options?: PaginateOptions,
  ) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortField = dto.sortBy ?? 'createdAt';
    const sortDir = dto.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir };

    // Mongoose query chaining breaks strict generic inference — intentional any.
    let query = this.model.find(filter).sort(sort).skip(skip).limit(limit) as any;
    if (options?.select) query = query.select(options.select);
    if (options?.populate) query = query.populate(options.populate);
    if (options?.lean !== false) query = query.lean();

    const countPromise =
      page <= 3 ? this.model.countDocuments(filter).exec() : Promise.resolve(undefined);

    const [items, total] = await Promise.all([query.exec(), countPromise]);

    const result = paginate(items, total ?? -1, dto);
    if (total === undefined) {
      (result.meta as Record<string, unknown>).total = undefined;
      (result.meta as Record<string, unknown>).totalPages = undefined;
    }
    return result;
  }

  /**
   * Keyset pagination — O(1) seek regardless of page depth.
   * Pass cursor from previous response meta.nextCursor.
   */
  async findCursorPaginated(
    filter: FilterQuery<T>,
    dto: PaginationDto,
    options?: PaginateOptions & { cursorField?: string },
  ) {
    const limit = dto.limit ?? 20;
    const sortField = options?.cursorField ?? dto.sortBy ?? 'createdAt';
    const sortDir = dto.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir, _id: sortDir };

    const qFilter = { ...filter } as Record<string, unknown>;
    if (dto.cursor) {
      const op = sortDir === -1 ? '$lt' : '$gt';
      qFilter[sortField] = { [op]: dto.cursor };
    }

    let query = this.model
      .find(qFilter as FilterQuery<T>)
      .sort(sort)
      .limit(limit + 1) as any;
    if (options?.select) query = query.select(options.select);
    if (options?.populate) query = query.populate(options.populate);
    if (options?.lean !== false) query = query.lean();

    const items = (await query.exec()) as Array<Record<string, unknown>>;
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const last = page[page.length - 1];
    const rawCursor = last?.[sortField];
    const nextCursor =
      hasMore && rawCursor != null
        ? String(rawCursor instanceof Date ? rawCursor.toISOString() : rawCursor)
        : null;

    return paginateCursor(page, dto, nextCursor);
  }
}
