import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../modules/users/schemas/user.schema';
import { SystemRole, PanelType } from '../common/constants/roles.constant';

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles: SystemRole[];
  panel: PanelType;
  employeeId?: string;
}

const DEFAULT_USERS: SeedUser[] = [
  {
    email: 'admin@quoreb2b.com',
    password: 'Admin@123',
    firstName: 'Super',
    lastName: 'Admin',
    roles: [SystemRole.SUPER_ADMIN, SystemRole.ADMIN],
    panel: PanelType.CRM,
  },
  {
    email: 'dba@quoreb2b.com',
    password: 'Dba@1234',
    firstName: 'Database',
    lastName: 'Admin',
    employeeId: 'DBA001',
    roles: [SystemRole.DB_ADMIN],
    panel: PanelType.DB_ADMIN,
  },
  {
    email: 'employee@quoreb2b.com',
    password: 'Emp@1234',
    firstName: 'John',
    lastName: 'Employee',
    employeeId: 'EMP001',
    roles: [SystemRole.EMPLOYEE],
    panel: PanelType.CRM,
  },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async onModuleInit() {
    await this.reseed();
  }

  async reseed() {
    await this.seedDefaultUsers();
  }

  private async seedDefaultUsers() {
    for (const u of DEFAULT_USERS) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      const email = u.email.toLowerCase().trim();
      const employeeId = u.employeeId?.toUpperCase();

      const doc = {
        email,
        passwordHash,
        plainPassword: u.password,
        firstName: u.firstName,
        lastName: u.lastName,
        employeeId,
        roles: u.roles,
        panel: u.panel,
        permissions: [] as string[],
        isActive: true,
      };

      await this.userModel.updateOne({ email }, { $set: doc }, { upsert: true });

      if (employeeId) {
        await this.userModel.updateMany(
          { employeeId: { $exists: true, $ne: employeeId }, email },
          { $set: { employeeId } },
        );
        await this.userModel.updateOne({ employeeId }, { $set: doc }, { upsert: true });
      }

      this.logger.log(
        `Default user ready: ${email}${employeeId ? ` (${employeeId})` : ''} → password: ${u.password}`,
      );
    }
  }
}
