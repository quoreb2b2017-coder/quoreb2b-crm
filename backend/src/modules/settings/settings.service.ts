import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Setting } from './schemas/setting.schema';

@Injectable()
export class SettingsService {
  constructor(@InjectModel(Setting.name) private model: Model<Setting>) {}

  async get(key: string) {
    return this.model.findOne({ key }).exec();
  }

  async set(key: string, value: unknown, group?: string) {
    return this.model.findOneAndUpdate(
      { key },
      { key, value, group },
      { upsert: true, new: true },
    );
  }

  async getByGroup(group: string) {
    return this.model.find({ group }).exec();
  }
}
