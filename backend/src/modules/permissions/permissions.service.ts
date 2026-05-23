import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Permission } from './schemas/permission.schema';

@Injectable()
export class PermissionsService {
  constructor(@InjectModel(Permission.name) private model: Model<Permission>) {}

  async findAll() {
    return this.model.find().sort({ module: 1, key: 1 }).exec();
  }

  async seed(permissions: Partial<Permission>[]) {
    for (const p of permissions) {
      await this.model.updateOne({ key: p.key }, p, { upsert: true });
    }
    return this.findAll();
  }
}
