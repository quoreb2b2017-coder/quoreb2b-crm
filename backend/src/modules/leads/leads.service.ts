import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { LeadsRepository } from './leads.repository';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds, stableHash } from '../../redis/cache.util';

const LEAD_LIST_PROJECTION =
  'firstName lastName email phone status source assignedTo companyId createdAt updatedAt';

@Injectable()
export class LeadsService {
  constructor(
    private repository: LeadsRepository,
    private elasticsearch: ElasticsearchService,
    private cache: AppCacheService,
    private config: ConfigService,
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
    void this.cache.delByPrefix('leads:list:');
    return lead;
  }

  async findAll(dto: PaginationDto, filters?: Record<string, unknown>) {
    const cacheKey = `leads:list:${stableHash({ ...dto, ...filters })}`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'short'), async () => {
      const filter = { ...filters } as Record<string, unknown>;
      if (dto.search?.trim()) {
        if (this.elasticsearch.isEnabled) {
          const ids = await this.elasticsearch.searchIds('leads', {
            query: { multi_match: { query: dto.search, fields: ['firstName', 'lastName', 'email'] } },
            size: dto.limit ?? 20,
          });
          if (ids.length) {
            filter._id = { $in: ids.map((id) => new Types.ObjectId(id)) };
          } else {
            return { data: [], meta: { total: 0, page: dto.page ?? 1, limit: dto.limit ?? 20, totalPages: 0, hasNextPage: false, hasPrevPage: false } };
          }
        } else {
          filter.$text = { $search: dto.search };
        }
      }

      if (dto.cursor) {
        return this.repository.findCursorPaginated(filter, dto, {
          select: LEAD_LIST_PROJECTION,
          cursorField: dto.sortBy ?? 'createdAt',
        });
      }

      return this.repository.findPaginated(filter, dto, {
        select: LEAD_LIST_PROJECTION,
      });
    });
  }

  async findById(id: string) {
    const cacheKey = `leads:one:${id}`;
    const lead = await this.cache.wrap(
      cacheKey,
      cacheTtlSeconds(this.config, 'medium'),
      () => this.repository.findById(id),
    );
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
    void this.cache.del(`leads:one:${id}`);
    void this.cache.delByPrefix('leads:list:');
    return lead;
  }

  async remove(id: string) {
    const lead = await this.repository.delete(id);
    if (!lead) throw new NotFoundException('Lead not found');
    await this.elasticsearch.delete('leads', id);
    void this.cache.del(`leads:one:${id}`);
    void this.cache.delByPrefix('leads:list:');
    return lead;
  }
}
