import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign } from './schemas/campaign.schema';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class CampaignsService {
  constructor(@InjectModel(Campaign.name) private model: Model<Campaign>) {}

  async findAll(dto: PaginationDto, clientId?: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const filter = clientId ? { clientId } : {};
    const [items, total] = await Promise.all([
      this.model.find(filter).skip((page - 1) * limit).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return paginate(items, total, dto);
  }

  async create(data: Partial<Campaign>) {
    return this.model.create(data);
  }
}
