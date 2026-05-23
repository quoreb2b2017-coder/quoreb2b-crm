import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SystemRole } from '../../common/constants/roles.constant';

interface OtpEntry {
  code: string;
  expiresAt: number;
}

@Injectable()
export class OtpService {
  private readonly store = new Map<string, OtpEntry>();

  constructor(private usersService: UsersService) {}

  async sendOtp(email: string): Promise<{ message: string; devOtp?: string }> {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    if (!user) {
      throw new BadRequestException('No admin account found for this email');
    }
    const roles = user.roles ?? [];
    if (!roles.includes(SystemRole.ADMIN) && !roles.includes(SystemRole.SUPER_ADMIN)) {
      throw new BadRequestException('OTP login is only available for admin accounts');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = email.toLowerCase();
    this.store.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000 });

    const response: { message: string; devOtp?: string } = {
      message: 'OTP sent to your email',
    };
    if (process.env.NODE_ENV !== 'production') {
      response.devOtp = code;
    }
    return response;
  }

  verifyOtp(email: string, otp: string): boolean {
    const key = email.toLowerCase();
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
