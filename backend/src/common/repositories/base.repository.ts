import { Model, Document, FilterQuery, UpdateQuery } from 'mongoose';
import { PaginationDto, paginate } from '../dto/pagination.dto';

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
    populate?: string | string[],
  ) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = {
      [dto.sortBy ?? 'createdAt']: dto.sortOrder === 'asc' ? 1 : -1,
    };

    let query = this.model.find(filter).sort(sort).skip(skip).limit(limit);
    if (populate) query = query.populate(populate);

    const [items, total] = await Promise.all([
      query.exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return paginate(items, total, dto);
  }
}
