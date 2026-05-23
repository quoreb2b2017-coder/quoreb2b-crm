import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Lead } from './schemas/lead.schema';

@Injectable()
export class LeadsRepository extends BaseRepository<Lead> {
  constructor(@InjectModel(Lead.name) model: Model<Lead>) {
    super(model);
  }
}
