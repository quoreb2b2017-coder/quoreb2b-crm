import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../common/repositories/base.repository';
import { User } from './schemas/user.schema';

/** Fallback employee-ID lookup (empty — no demo accounts). */
export const EMPLOYEE_ID_EMAIL_MAP: Record<string, string> = {};

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(@InjectModel(User.name) model: Model<User>) {
    super(model);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.model.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash').exec();
  }

  async findByEmployeeId(employeeId: string): Promise<User | null> {
    const id = employeeId.trim().toUpperCase();
    if (!id) return null;

    let user = await this.model.findOne({ employeeId: id }).select('+passwordHash').exec();

    if (!user) {
      user = await this.model
        .findOne({ employeeId: { $regex: new RegExp(`^${id}$`, 'i') } })
        .select('+passwordHash')
        .exec();
    }

    if (!user) {
      const mappedEmail = EMPLOYEE_ID_EMAIL_MAP[id];
      if (mappedEmail) {
        return this.findByEmail(mappedEmail);
      }
    }

    return user;
  }

  async findActiveByRoles(roles: string[], limit = 500): Promise<User[]> {
    return this.model
      .find({ isActive: true, roles: { $in: roles } })
      .sort({ firstName: 1, lastName: 1 })
      .limit(limit)
      .exec();
  }

  async findByIds(ids: string[]): Promise<User[]> {
    const objectIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (!objectIds.length) return [];
    return this.model.find({ _id: { $in: objectIds } }).exec();
  }

  async findPlainPassword(id: string): Promise<string | null> {
    const user = await this.model.findById(id).select('+plainPassword').lean().exec();
    return (user as unknown as { plainPassword?: string })?.plainPassword ?? null;
  }
}
