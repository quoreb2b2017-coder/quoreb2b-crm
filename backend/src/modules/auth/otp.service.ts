import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { SystemRole } from '../../common/constants/roles.constant';
import { assertSuperAdminLoginEmail } from '../../config/super-admin-login.util';
import { ResendMailService } from './resend-mail.service';

interface OtpEntry {
  code: string;
  expiresAt: number;
}

@Injectable()
export class OtpService {
  private readonly store = new Map<string, OtpEntry>();

  constructor(
    private usersService: UsersService,
    private resendMail: ResendMailService,
    private config: ConfigService,
  ) {}

  async sendOtp(email: string): Promise<{ message: string }> {
    const normalized = email.toLowerCase().trim();
    assertSuperAdminLoginEmail(normalized);

    const user = await this.usersService.findByEmail(normalized);
    if (!user) {
      throw new BadRequestException('No admin account found for this email');
    }
    const roles = user.roles ?? [];
    if (!roles.includes(SystemRole.ADMIN) && !roles.includes(SystemRole.SUPER_ADMIN)) {
      throw new BadRequestException('OTP login is only available for admin accounts');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.store.set(normalized, { code, expiresAt: Date.now() + 10 * 60 * 1000 });

    const devFallback =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      process.env.OTP_DEV_FALLBACK === 'true';

    if (this.resendMail.isConfigured()) {
      await this.resendMail.sendOtpEmail(normalized, code);
      return { message: 'OTP sent to your email' };
    }

    if (devFallback) {
      // Local-only escape hatch — never enabled in production.
      console.warn(`[OTP_DEV_FALLBACK] code for ${normalized}: ${code}`);
      return { message: 'OTP sent to your email' };
    }

    throw new InternalServerErrorException(
      'Email service is not configured. Set RESEND_API_KEY on the server.',
    );
  }

  verifyOtp(email: string, otp: string): boolean {
    const key = email.toLowerCase().trim();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    if (entry.code !== otp.trim()) return false;
    this.store.delete(key);
    return true;
  }
}
