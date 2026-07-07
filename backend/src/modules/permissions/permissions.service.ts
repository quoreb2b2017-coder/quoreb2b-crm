import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Permission } from './schemas/permission.schema';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds } from '../../redis/cache.util';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(Permission.name) private model: Model<Permission>,
    private cache: AppCacheService,
    private config: ConfigService,
  ) {}

  async findAll() {
    return this.cache.wrap(
      'permissions:all',
      cacheTtlSeconds(this.config, 'long'),
      () => this.model.find().select('key module description').sort({ module: 1, key: 1 }).lean().exec(),
    );
  }

  async seed(permissions: Partial<Permission>[]) {
    for (const p of permissions) {
      await this.model.updateOne({ key: p.key }, p, { upsert: true });
    }
    void this.cache.del('permissions:all');
    return this.findAll();
  }
}
