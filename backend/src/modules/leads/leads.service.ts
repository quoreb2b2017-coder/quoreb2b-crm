import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LeadsRepository } from './leads.repository';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';

@Injectable()
export class LeadsService {
  constructor(
    private repository: LeadsRepository,
    private elasticsearch: ElasticsearchService,
  ) {}

  async create(dto: CreateLeadDto, userId?: string) {
    const lead = await this.repository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      source: dto.source,
      ...(dto.companyId ? { companyId: new Types.ObjectId(dto.companyId) } : {}),
      ...(userId ? { assignedTo: new Types.ObjectId(userId) } : {}),
    });
    await this.elasticsearch.index('leads', lead._id.toString(), {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      status: lead.status,
    });
    return lead;
  }

  async findAll(dto: PaginationDto, filters?: Record<string, unknown>) {
    const filter = { ...filters };
    if (dto.search) {
      filter.$or = [
        { email: { $regex: dto.search, $options: 'i' } },
        { firstName: { $regex: dto.search, $options: 'i' } },
        { lastName: { $regex: dto.search, $options: 'i' } },
      ];
    }
    return this.repository.findPaginated(filter, dto);
  }

  async findById(id: string) {
    const lead = await this.repository.findById(id);
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    const update: Record<string, unknown> = { ...dto };
    if (dto.assignedTo) {
      update.assignedTo = new Types.ObjectId(dto.assignedTo);
    }
    const lead = await this.repository.update(id, update);
    if (!lead) throw new NotFoundException('Lead not found');
    await this.elasticsearch.index('leads', id, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      status: lead.status,
    });
    return lead;
  }

  async remove(id: string) {
    const lead = await this.repository.delete(id);
    if (!lead) throw new NotFoundException('Lead not found');
    await this.elasticsearch.delete('leads', id);
    return lead;
  }
}
