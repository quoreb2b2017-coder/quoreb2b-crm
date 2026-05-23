import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from './schemas/role.schema';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class RolesService {
  constructor(@InjectModel(Role.name) private model: Model<Role>) {}

  async findAll(dto: PaginationDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const [items, total] = await Promise.all([
      this.model.find().skip((page - 1) * limit).limit(limit).exec(),
      this.model.countDocuments().exec(),
    ]);
    return paginate(items, total, dto);
  }

  async create(data: Partial<Role>) {
    return this.model.create(data);
  }

  async findByName(name: string) {
    return this.model.findOne({ name }).exec();
  }
}
