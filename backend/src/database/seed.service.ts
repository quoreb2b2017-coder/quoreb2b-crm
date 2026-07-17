import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../modules/users/schemas/user.schema';
import { SystemRole, PanelType } from '../common/constants/roles.constant';
import { encryptViewablePassword } from '../modules/users/password-view.util';

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles: SystemRole[];
  panel: PanelType;
  employeeId?: string;
}

/** Only the primary bootstrap super admin — no dummy employees or db admins. */
const DEFAULT_USERS: SeedUser[] = [
  {
    email: 'quoreb2b2017@gmail.com',
    password: 'Quore@2026',
    firstName: 'Quore',
    lastName: 'Admin',
    roles: [SystemRole.SUPER_ADMIN, SystemRole.ADMIN],
    panel: PanelType.CRM,
  },
];

const LEGACY_SEED_EMAILS = [
  'admin@quoreb2b.com',
  'rohit@quoreb2b.com',
  'sadik@quoreb2b.com',
  'dba@quoreb2b.com',
  'employee@quoreb2b.com',
];

const LEGACY_SEED_EMPLOYEE_IDS = ['DBA001', 'EMP001'];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    // Only ensure the bootstrap super admin exists — do not delete real accounts on every deploy.
    await this.seedDefaultUsers();
  }

  async reseed() {
    await this.removeLegacySeedUsers();
    await this.seedDefaultUsers();
  }

  private async removeLegacySeedUsers() {
    const emails = LEGACY_SEED_EMAILS.map((e) => e.toLowerCase().trim());
    const result = await this.userModel.deleteMany({
      $or: [
        { email: { $in: emails } },
        { employeeId: { $in: LEGACY_SEED_EMPLOYEE_IDS } },
      ],
    });
    if (result.deletedCount > 0) {
      this.logger.log(`Removed ${result.deletedCount} legacy seed user(s)`);
    }
  }

  private async seedDefaultUsers() {
    const viewSecret =
      this.config.get<string>('PASSWORD_VIEW_SECRET')?.trim() ||
      this.config.get<string>('JWT_ACCESS_SECRET')?.trim() ||
      this.config.get<string>('JWT_SECRET')?.trim() ||
      process.env.PASSWORD_VIEW_SECRET?.trim() ||
      process.env.JWT_ACCESS_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      '';

    for (const u of DEFAULT_USERS) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      const passwordEnc = viewSecret
        ? encryptViewablePassword(u.password, viewSecret)
        : undefined;
      const email = u.email.toLowerCase().trim();
      const employeeId = u.employeeId?.toUpperCase();

      const doc = {
        email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        employeeId,
        roles: u.roles,
        panel: u.panel,
        permissions: [] as string[],
        isActive: true,
      };

      await this.userModel.updateOne(
        { email },
        {
          $set: doc,
          ...(passwordEnc ? { $setOnInsert: { passwordEnc } } : {}),
          $unset: { plainPassword: 1 },
        },
        { upsert: true },
      );

      if (employeeId) {
        await this.userModel.updateMany(
          { employeeId: { $exists: true, $ne: employeeId }, email },
          { $set: { employeeId } },
        );
        await this.userModel.updateOne({ employeeId }, { $set: doc }, { upsert: true });
      }

      this.logger.log(`Default user ready: ${email}`);
    }
  }
}
