import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Request } from 'express';
import { extractClientIp } from '../../common/utils/client-ip.util';
import { assertLoginIpAllowed } from '../../config/login-ip-restriction.util';
import {
  assertSuperAdminLoginEmail,
  isSuperAdminRole,
  isSuperAdminEmailAllowlistActive,
} from '../../config/super-admin-login.util';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/login.dto';
import { EmployeeIdLoginDto } from './dto/employee-login.dto';
import { RefreshToken } from './schemas/refresh-token.schema';
import { SystemRole } from '../../common/constants/roles.constant';
import { OtpService } from './otp.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { actorFromUserDoc } from '../activity-logs/activity-user.util';
import { AttendanceService } from '../attendance/attendance.service';

function extractMeta(req: Request) {
  const ip = extractClientIp(req);
  const userAgent = (req.headers['user-agent'] as string) || 'unknown';
  return { ip, userAgent };
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private otpService: OtpService,
    private activityLogsService: ActivityLogsService,
    private attendanceService: AttendanceService,
    @InjectModel(RefreshToken.name) private refreshTokenModel: Model<RefreshToken>,
  ) {}

  private async recordLoginAttendance(user: { _id: { toString(): string }; roles?: string[] }) {
    try {
      return await this.attendanceService.ensureLoginAttendance(
        user._id.toString(),
        user.roles ?? [],
      );
    } catch {
      return { punchedIn: false };
    }
  }

  /** Gross minutes logged today (prior sessions + this login) for same-day re-login timer. */
  private async fetchTodayGrossMinutes(userId: string, sessionId: string): Promise<number> {
    try {
      const snap = await this.activityLogsService.getMyWorkTime(userId, sessionId);
      return snap.todayGrossMinutes ?? 0;
    } catch {
      return 0;
    }
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roles: [SystemRole.CLIENT],
      permissions: [],
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto, req?: Request) {
    if (req) assertLoginIpAllowed(req);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been blocked. Contact your administrator.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (isSuperAdminRole(user.roles) && isSuperAdminEmailAllowlistActive()) {
      assertSuperAdminLoginEmail(dto.email, user.roles);
    }

    const sessionId = randomBytes(16).toString('hex');
    const meta = req ? extractMeta(req) : { ip: 'unknown', userAgent: 'unknown' };
    await this.usersService.update(user._id.toString(), { lastLoginAt: new Date() });
    const actor = actorFromUserDoc(user);
    await this.activityLogsService.logWithActor(actor, {
      action: 'LOGIN',
      resource: 'auth',
      metadata: {
        method: 'email',
        sessionId,
        actorName: [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email,
      },
      userAgent: meta.userAgent,
      sessionId,
    });
    const attendancePunch = await this.recordLoginAttendance(user);
    const workTimeTodayGrossMinutes = await this.fetchTodayGrossMinutes(
      user._id.toString(),
      sessionId,
    );
    return {
      ...(await this.generateTokens(user, sessionId)),
      attendancePunch,
      workTimeTodayGrossMinutes,
    };
  }

  async loginByEmployeeId(dto: EmployeeIdLoginDto, req?: Request) {
    if (req) assertLoginIpAllowed(req);

    const employeeId = dto.employeeId.trim();
    const password = dto.password.trim();

    const user = await this.usersService.findByEmployeeId(employeeId);
    if (!user) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been blocked. Contact your administrator.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    const sessionId = randomBytes(16).toString('hex');
    const meta = req ? extractMeta(req) : { ip: 'unknown', userAgent: 'unknown' };
    await this.usersService.update(user._id.toString(), { lastLoginAt: new Date() });
    const actor = actorFromUserDoc(user);
    await this.activityLogsService.logWithActor(actor, {
      action: 'LOGIN',
      resource: 'auth',
      metadata: {
        method: 'employee_id',
        employeeId,
        sessionId,
        actorName: [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email,
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      sessionId,
    });
    const attendancePunch = await this.recordLoginAttendance(user);
    const workTimeTodayGrossMinutes = await this.fetchTodayGrossMinutes(
      user._id.toString(),
      sessionId,
    );
    return {
      ...(await this.generateTokens(user, sessionId)),
      attendancePunch,
      workTimeTodayGrossMinutes,
    };
  }

  async sendOtp(email: string) {
    return this.otpService.sendOtp(email);
  }

  async verifyOtpLogin(email: string, otp: string, req?: Request) {
    if (req) assertLoginIpAllowed(req);

    const valid = this.otpService.verifyOtp(email, otp);
    if (!valid) throw new UnauthorizedException('Invalid or expired OTP');

    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) throw new UnauthorizedException('User not found');

    const roles = user.roles ?? [];
    if (!roles.includes(SystemRole.ADMIN) && !roles.includes(SystemRole.SUPER_ADMIN)) {
      throw new BadRequestException('Not an admin account');
    }

    const sessionId = randomBytes(16).toString('hex');
    const actor = actorFromUserDoc(user);
    await this.activityLogsService.logWithActor(actor, {
      action: 'LOGIN',
      resource: 'auth',
      metadata: {
        method: 'otp',
        sessionId,
        actorName: [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email,
      },
      sessionId,
    });
    const attendancePunch = await this.recordLoginAttendance(user);
    const workTimeTodayGrossMinutes = await this.fetchTodayGrossMinutes(
      user._id.toString(),
      sessionId,
    );
    return {
      ...(await this.generateTokens(user, sessionId)),
      attendancePunch,
      workTimeTodayGrossMinutes,
    };
  }

  async refresh(refreshToken: string) {
    const stored = await this.refreshTokenModel.findOne({
      token: refreshToken,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.usersService.findDocumentById(stored.userId.toString());
    if (!user || !user.isActive) throw new UnauthorizedException('User not found');

    await this.refreshTokenModel.updateOne({ _id: stored._id }, { isRevoked: true });
    return this.generateTokens(user, stored.sessionId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    return this.usersService.changePassword(userId, currentPassword, newPassword);
  }

  async logout(refreshToken: string, reason: string = 'manual', req?: Request) {
    const stored = await this.refreshTokenModel.findOne({ token: refreshToken });
    const loggedOutAt = new Date();
    if (stored?.userId) {
      const meta = req ? extractMeta(req) : { ip: 'unknown', userAgent: 'unknown' };
      const user = await this.usersService.findDocumentById(stored.userId.toString()).catch(() => null);
      const actor = user
        ? actorFromUserDoc(user)
        : { id: stored.userId.toString(), email: 'unknown', roles: [] };
      const isEod = reason === 'eod';
      const isSleepOrIdle = reason === 'idle';
      await this.activityLogsService.logWithActor(actor, {
        action: isSleepOrIdle ? 'IDLE_LOGOUT' : 'LOGOUT',
        resource: 'auth',
        metadata: {
          reason,
          logoutType: isEod ? 'eod' : isSleepOrIdle ? 'sleep_idle' : 'manual',
          loggedOutAt: loggedOutAt.toISOString(),
          actorName: [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email,
        },
        sessionId: stored.sessionId,
        userAgent: meta.userAgent,
      });
      if (user) {
        const uid = user._id.toString();
        const roles = user.roles ?? [];
        if (isEod) {
          await this.attendanceService.ensureEodLogoutAttendance(uid, roles, loggedOutAt);
        } else {
          await this.attendanceService.ensureSessionLogoutAttendance(uid, roles, loggedOutAt);
        }
      }
    }
    await this.refreshTokenModel.updateOne({ token: refreshToken }, { isRevoked: true });
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(user: import('../users/schemas/user.schema').User, sessionId?: string) {
    const safe = this.usersService.sanitizeUser(user);
    const payload = {
      sub: safe.id,
      email: safe.email,
      roles: safe.roles,
      permissions: safe.permissions,
      sessionId,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = randomBytes(64).toString('hex');
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresAt = new Date(Date.now() + this.parseExpiry(expiresIn));

    await this.refreshTokenModel.create({ userId: user._id, token: refreshToken, expiresAt, sessionId });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      user: safe,
      sessionId: sessionId ?? undefined,
    };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([dhms])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const [, num, unit] = match;
    const n = parseInt(num, 10);
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return n * (multipliers[unit] ?? multipliers.d);
  }
}
