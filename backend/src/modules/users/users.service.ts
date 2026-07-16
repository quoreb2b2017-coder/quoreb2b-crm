import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { PanelType, SystemRole } from '../../common/constants/roles.constant';
import { User } from './schemas/user.schema';
import { RefreshToken } from '../auth/schemas/refresh-token.schema';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  ActivityActor,
  actorFromUserDoc,
} from '../activity-logs/activity-user.util';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { ConfigService } from '@nestjs/config';
import { cacheTtlSeconds, stableHash } from '../../redis/cache.util';
import {
  decryptViewablePassword,
  encryptViewablePassword,
} from './password-view.util';
import { ResendMailService } from '../auth/resend-mail.service';

interface ActionOtpEntry {
  code: string;
  expiresAt: number;
  purpose: string;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly actionOtps = new Map<string, ActionOtpEntry>();

  constructor(
    private repository: UsersRepository,
    @InjectModel(RefreshToken.name) private refreshTokenModel: Model<RefreshToken>,
    private activityLogs: ActivityLogsService,
    private notifications: NotificationTriggerService,
    private cache: AppCacheService,
    private config: ConfigService,
    private resendMail: ResendMailService,
  ) {}

  async onModuleInit() {
    try {
      const cleared = await this.repository.wipeAllPlainPasswords();
      if (cleared > 0) {
        this.logger.warn(
          `Removed plaintext passwords from ${cleared} user document(s) — bcrypt hash only`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to wipe plain passwords: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeUser(user);
  }

  /** Batch lookup for activity log enrichment (skips missing ids) */
  async findManyByIds(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const users = await this.repository.findByIds(unique);
    return users.map((u) => this.sanitizeUser(u));
  }

  /** Alias used by in-app chat */
  async findUsersByIds(ids: string[]) {
    return this.findManyByIds(ids);
  }

  async findByIdSafe(id: string) {
    const user = await this.repository.findById(id);
    if (!user) return null;
    return this.sanitizeUser(user);
  }

  /** Active CRM users for WhatsApp-style chat contacts (auto by name). */
  async findActiveChatContacts(limit = 500) {
    const roles = [
      SystemRole.SUPER_ADMIN,
      SystemRole.ADMIN,
      SystemRole.EMPLOYEE,
      SystemRole.DB_ADMIN,
    ];
    const users = await this.repository.findActiveByRoles(roles, limit);
    return users.map((u) => this.sanitizeUser(u));
  }

  async findDocumentById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    return this.repository.findByEmail(email);
  }

  async findByEmployeeId(employeeId: string) {
    return this.repository.findByEmployeeId(employeeId);
  }

  async create(data: Partial<User>) {
    return this.repository.create(data);
  }

  async createByAdmin(dto: CreateUserDto, actor?: ActivityActor) {
    const roles = this.normalizeAdminRoles(dto.roles);
    this.assertRoleAssignmentAllowed(roles, actor);

    const existing = await this.repository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    if (dto.employeeId) {
      const existingId = await this.repository.findByEmployeeId(dto.employeeId);
      if (existingId) throw new ConflictException('Employee ID already in use');
    }

    const needsEmployeeId =
      roles.includes(SystemRole.EMPLOYEE) || roles.includes(SystemRole.DB_ADMIN);
    if (needsEmployeeId && !dto.employeeId?.trim()) {
      throw new BadRequestException('Employee ID is required for this role');
    }

    const panel = dto.panel ?? this.panelForRoles(roles);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const passwordEnc = this.encryptPasswordForView(dto.password);

    const user = await this.repository.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      employeeId: dto.employeeId?.toUpperCase(),
      roles,
      panel,
      permissions: [],
      isActive: true,
      ...(passwordEnc ? { passwordEnc } : {}),
    });
    // Drop any legacy plaintext; keep encrypted vault copy when available.
    await this.repository.unsetPlainPassword(String(user._id));
    if (passwordEnc) {
      await this.repository.setPasswordEnc(String(user._id), passwordEnc);
    }

    const safe = this.sanitizeUser(user);
    await this.bustUsersCache();
    if (actor) {
      await this.activityLogs.logWithActor(actor, {
        action: 'USER_CREATED',
        resource: 'users',
        resourceId: safe.id,
        metadata: {
          targetEmail: safe.email,
          targetName: `${safe.firstName} ${safe.lastName}`,
          targetRole: safe.roles?.[0],
          employeeId: safe.employeeId,
        },
      });
    }
    try {
      await this.notifications.notifyUser(safe.id, {
        type: 'success',
        title: 'Account created',
        message: 'Your account has been created and is ready to use.',
        priority: 'high',
        actionUrl: safe.roles?.includes(SystemRole.DB_ADMIN)
          ? '/db-admin/dashboard'
          : safe.roles?.includes(SystemRole.EMPLOYEE)
            ? '/employee/dashboard'
            : '/admin/dashboard',
        actionLabel: 'Open dashboard',
      });
    } catch {
      /* notification should not block user creation */
    }
    return safe;
  }

  /** Employees (and db_admins for admin) for batch sharing — includes db_admin callers */
  async listTeamMembers(callerRoles: string[] = []) {
    const roleKey = [...callerRoles].sort().join(',') || 'default';
    return this.cache.wrap(
      `users:team:${roleKey}`,
      cacheTtlSeconds(this.config, 'long'),
      () => this.loadTeamMembers(callerRoles),
    );
  }

  private async loadTeamMembers(callerRoles: string[] = []) {
    const isDbAdminOnly =
      callerRoles.includes(SystemRole.DB_ADMIN) &&
      !callerRoles.includes(SystemRole.ADMIN) &&
      !callerRoles.includes(SystemRole.SUPER_ADMIN);

    const shareableRoles = isDbAdminOnly
      ? [SystemRole.EMPLOYEE]
      : [SystemRole.EMPLOYEE, SystemRole.DB_ADMIN];

    const users = await this.repository.findActiveByRoles(shareableRoles, 500);
    return {
      data: users.map((u) => this.sanitizeUser(u)),
    };
  }

  async findAll(dto: PaginationDto) {
    return this.cache.wrap(
      `users:list:${stableHash({ ...dto })}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.loadAllUsers(dto),
    );
  }

  private async loadAllUsers(dto: PaginationDto) {
    const filter: Record<string, unknown> = {};
    if (dto.search) {
      filter.$or = [
        { email: { $regex: dto.search, $options: 'i' } },
        { firstName: { $regex: dto.search, $options: 'i' } },
        { lastName: { $regex: dto.search, $options: 'i' } },
        { employeeId: { $regex: dto.search, $options: 'i' } },
      ];
    }
    const result = await this.repository.findPaginated(filter, dto);
    return {
      ...result,
      data: result.data.map((u) => this.sanitizeUser(u as User)),
    };
  }

  async update(id: string, data: Record<string, unknown>) {
    const user = await this.repository.update(id, data);
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeUser(user);
  }

  async getPlainPassword(id: string, actor?: ActivityActor): Promise<string | null> {
    const actorRoles = actor?.roles ?? [];
    if (!actorRoles.includes(SystemRole.SUPER_ADMIN)) {
      throw new ForbiddenException('Only Super Admin can view user passwords');
    }

    const target = await this.repository.findById(id);
    if (!target) throw new NotFoundException('User not found');

    const enc = await this.repository.findPasswordEnc(id);
    const secret = this.passwordViewSecret();
    const password = enc && secret ? decryptViewablePassword(enc, secret) : null;

    await this.activityLogs.logWithActor(actor!, {
      action: 'VIEW_USER_PASSWORD',
      resource: 'users',
      resourceId: id,
      metadata: {
        targetEmail: target.email,
        targetName: `${target.firstName} ${target.lastName}`,
        targetRole: target.roles?.[0],
        revealed: Boolean(password),
        note: password
          ? 'Password revealed to Super Admin'
          : 'No viewable password stored — reset/create password again',
      },
    });

    return password;
  }

  async setActiveStatus(id: string, isActive: boolean, actor?: ActivityActor) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    this.assertManageable(user, actor, { allowAdminTargets: false });

    await this.repository.update(id, { isActive });
    if (!isActive) {
      await this.revokeAllSessions(id);
    }
    await this.bustUsersCache();
    const updated = this.sanitizeUser((await this.repository.findById(id))!);
    if (actor) {
      await this.activityLogs.logWithActor(actor, {
        action: isActive ? 'USER_UNBLOCKED' : 'USER_BLOCKED',
        resource: 'users',
        resourceId: id,
        metadata: {
          targetEmail: user.email,
          targetName: `${user.firstName} ${user.lastName}`,
          targetRole: user.roles?.[0],
        },
      });
    }
    try {
      await this.notifications.notifyUser(id, {
        type: isActive ? 'success' : 'warning',
        title: isActive ? 'Account unblocked' : 'Account blocked',
        message: isActive
          ? 'Your account has been activated again.'
          : 'Your account has been blocked by admin.',
        priority: 'high',
        actionUrl: '/',
        actionLabel: isActive ? 'Sign in' : 'Open login',
      });
    } catch {
      /* notification should not block status change */
    }
    return updated;
  }

  /** Send OTP to Super Admin email before deleting another Super Admin. */
  async sendDeleteSuperAdminOtp(targetId: string, actor: ActivityActor) {
    if (!actor.roles?.includes(SystemRole.SUPER_ADMIN)) {
      throw new ForbiddenException('Only Super Admin can delete Super Admin accounts');
    }
    const target = await this.repository.findById(targetId);
    if (!target) throw new NotFoundException('User not found');
    if (!this.isAdminAccount(target)) {
      throw new BadRequestException('OTP is only required when deleting a Super Admin account');
    }
    if (String(target._id) === actor.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const email = (actor.email || '').toLowerCase().trim();
    if (!email) {
      const actorUser = await this.repository.findById(actor.id);
      if (!actorUser?.email) {
        throw new BadRequestException('Could not resolve Super Admin email for OTP');
      }
    }
    const otpEmail = email || (await this.repository.findById(actor.id))!.email.toLowerCase();

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const purpose = `delete-super-admin:${targetId}`;
    const key = this.actionOtpKey(otpEmail, purpose);
    this.actionOtps.set(key, {
      code,
      purpose,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    if (this.resendMail.isConfigured()) {
      await this.resendMail.sendOtpEmail(otpEmail, code);
      return {
        message: `OTP sent to ${otpEmail}`,
        email: otpEmail,
        requiresOtp: true,
      };
    }

    const devFallback =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      process.env.OTP_DEV_FALLBACK === 'true';
    if (devFallback) {
      this.logger.warn(`[OTP_DEV_FALLBACK] delete-super-admin code for ${otpEmail}: ${code}`);
      return {
        message: `OTP sent to ${otpEmail}`,
        email: otpEmail,
        requiresOtp: true,
        ...(process.env.NODE_ENV !== 'production' ? { devCode: code } : {}),
      };
    }

    throw new BadRequestException(
      'Email service is not configured. Set RESEND_API_KEY on the server.',
    );
  }

  async deleteManagedUser(
    id: string,
    actor?: ActivityActor,
    opts?: { otp?: string },
  ) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    const targetIsAdmin = this.isAdminAccount(user);
    if (targetIsAdmin) {
      if (!actor?.roles?.includes(SystemRole.SUPER_ADMIN)) {
        throw new ForbiddenException('Only Super Admin can delete Super Admin accounts');
      }
      if (actor.id && String(user._id) === actor.id) {
        throw new ForbiddenException('You cannot delete your own account');
      }
      const remaining = await this.repository.countSuperAdmins();
      if (user.roles?.includes(SystemRole.SUPER_ADMIN) && remaining <= 1) {
        throw new ForbiddenException('Cannot delete the last Super Admin account');
      }

      let otpEmail = (actor.email || '').toLowerCase().trim();
      if (!otpEmail) {
        const actorUser = await this.repository.findById(actor.id);
        otpEmail = actorUser?.email?.toLowerCase() ?? '';
      }
      if (!otpEmail) {
        throw new BadRequestException('Could not resolve Super Admin email for OTP');
      }
      const otp = opts?.otp?.trim();
      if (!otp) {
        throw new BadRequestException('OTP is required to delete a Super Admin account');
      }
      const purpose = `delete-super-admin:${id}`;
      if (!this.verifyActionOtp(otpEmail, purpose, otp)) {
        throw new ForbiddenException('Invalid or expired OTP');
      }
    } else {
      this.assertManageable(user, actor, { allowAdminTargets: false });
    }

    if (actor) {
      await this.activityLogs.logWithActor(actor, {
        action: targetIsAdmin ? 'SUPER_ADMIN_DELETED_VIA_OTP' : 'USER_DELETED',
        resource: 'users',
        resourceId: id,
        metadata: {
          targetEmail: user.email,
          targetName: `${user.firstName} ${user.lastName}`,
          targetRole: user.roles?.[0],
        },
      });
    }
    await this.revokeAllSessions(id);
    await this.repository.delete(id);
    await this.bustUsersCache();
    return { message: 'User deleted successfully' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.repository.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const doc = await this.repository.findByEmail(user.email);
    if (!doc?.passwordHash) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(currentPassword, doc.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.repository.update(userId, { passwordHash });
    await this.repository.unsetPlainPassword(userId);
    const passwordEnc = this.encryptPasswordForView(newPassword);
    if (passwordEnc) {
      await this.repository.setPasswordEnc(userId, passwordEnc);
    }
    await this.revokeAllSessions(userId);

    await this.activityLogs.logWithActor(actorFromUserDoc(user), {
      action: 'PASSWORD_CHANGED',
      resource: 'auth',
      resourceId: userId,
      metadata: { email: user.email },
    });

    return { message: 'Password updated successfully. Please sign in again.' };
  }

  private encryptPasswordForView(plain: string): string | null {
    const secret = this.passwordViewSecret();
    if (!secret || !plain) return null;
    return encryptViewablePassword(plain, secret);
  }

  private passwordViewSecret(): string | null {
    const secret =
      this.config.get<string>('PASSWORD_VIEW_SECRET')?.trim() ||
      this.config.get<string>('JWT_SECRET')?.trim() ||
      '';
    return secret || null;
  }

  private isAdminAccount(user: User): boolean {
    const roles = user.roles ?? [];
    return roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN);
  }

  private actionOtpKey(email: string, purpose: string): string {
    return `${email.toLowerCase().trim()}::${purpose}`;
  }

  private verifyActionOtp(email: string, purpose: string, otp: string): boolean {
    const key = this.actionOtpKey(email, purpose);
    const entry = this.actionOtps.get(key);
    if (!entry || entry.purpose !== purpose || entry.expiresAt < Date.now()) {
      this.actionOtps.delete(key);
      return false;
    }
    if (entry.code !== otp.trim()) return false;
    this.actionOtps.delete(key);
    return true;
  }

  private async revokeAllSessions(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return;
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), isRevoked: false },
      { $set: { isRevoked: true } },
    );
  }

  private normalizeAdminRoles(roles: SystemRole[]): SystemRole[] {
    if (roles.includes(SystemRole.SUPER_ADMIN)) {
      return [SystemRole.SUPER_ADMIN, SystemRole.ADMIN];
    }
    return roles;
  }

  private assertRoleAssignmentAllowed(targetRoles: SystemRole[], actor?: ActivityActor) {
    const actorRoles = actor?.roles ?? [];
    const actorIsSuperAdmin = actorRoles.includes(SystemRole.SUPER_ADMIN);

    const allowedTargets = new Set<SystemRole>([
      SystemRole.EMPLOYEE,
      SystemRole.DB_ADMIN,
      SystemRole.SUPER_ADMIN,
      SystemRole.ADMIN,
    ]);

    for (const role of targetRoles) {
      if (!allowedTargets.has(role)) {
        throw new ForbiddenException(`Role "${role}" cannot be assigned from admin panel`);
      }
    }

    const assignsAdmin =
      targetRoles.includes(SystemRole.SUPER_ADMIN) || targetRoles.includes(SystemRole.ADMIN);
    if (assignsAdmin && !actorIsSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can create admin accounts');
    }
  }

  private assertManageable(
    user: User,
    actor?: ActivityActor,
    opts?: { allowAdminTargets?: boolean },
  ) {
    const roles = user.roles ?? [];
    const actorIsSuperAdmin = actor?.roles?.includes(SystemRole.SUPER_ADMIN) === true;
    const targetIsAdmin =
      roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN);

    if (targetIsAdmin) {
      if (!opts?.allowAdminTargets || !actorIsSuperAdmin) {
        throw new ForbiddenException('Admin accounts cannot be blocked or deleted');
      }
      return;
    }
    if (!roles.includes(SystemRole.EMPLOYEE) && !roles.includes(SystemRole.DB_ADMIN)) {
      throw new ForbiddenException('Only employee and database administrator accounts can be managed');
    }
  }

  sanitizeUser(user: User) {
    const obj = user.toObject ? user.toObject() : user;
    const { passwordHash, plainPassword, passwordEnc, ...safe } = obj as User & {
      passwordHash?: string;
      plainPassword?: string;
      passwordEnc?: string;
    };
    return {
      id: safe._id?.toString() ?? safe.id,
      email: safe.email,
      firstName: safe.firstName,
      lastName: safe.lastName,
      employeeId: safe.employeeId,
      roles: safe.roles,
      permissions: safe.permissions,
      panel: safe.panel,
      isActive: safe.isActive,
      lastLoginAt: safe.lastLoginAt,
    };
  }

  private panelForRoles(roles: SystemRole[]): PanelType {
    if (roles.includes(SystemRole.DB_ADMIN)) return PanelType.DB_ADMIN;
    return PanelType.CRM;
  }

  private async bustUsersCache(): Promise<void> {
    await Promise.all([
      this.cache.delByPrefix('users:list:'),
      this.cache.delByPrefix('users:team:'),
    ]);
  }
}
