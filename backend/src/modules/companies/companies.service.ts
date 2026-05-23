import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from './schemas/company.schema';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class CompaniesService {
  constructor(@InjectModel(Company.name) private model: Model<Company>) {}

  async findAll(dto: PaginationDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const filter = dto.search ? { name: { $regex: dto.search, $options: 'i' } } : {};
    const [items, total] = await Promise.all([
      this.model.find(filter).skip((page - 1) * limit).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return paginate(items, total, dto);
  }

  async create(data: Partial<Company>) {
    return this.model.create(data);
  }

  async findById(id: string) {
    const company = await this.model.findById(id).exec();
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }
}
