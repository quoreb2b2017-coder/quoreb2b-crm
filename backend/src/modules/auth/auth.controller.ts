import { Body, Controller, Post, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/login.dto';
import {
  EmployeeIdLoginDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/employee-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { SeedService } from '../../database/seed.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemRole } from '../../common/constants/roles.constant';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private authService: AuthService,
    private seedService: SeedService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  @Public()
  @Post('login/employee-id')
  @HttpCode(HttpStatus.OK)
  loginByEmployeeId(@Body() dto: EmployeeIdLoginDto, @Req() req: Request) {
    return this.authService.loginByEmployeeId(dto, req);
  }

  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.email);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtpLogin(dto.email, dto.otp, req);
  }

  /** Dev only: reset default user passwords in MongoDB */
  @Public()
  @Post('dev/reseed')
  @HttpCode(HttpStatus.OK)
  async devReseed() {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return { message: 'Not available in production' };
    }
    await this.seedService.reseed();
    return {
      message: 'Default users reset',
      accounts: [
        { role: 'admin', email: 'admin@quoreb2b.com', password: 'Admin@123' },
        { role: 'db_admin', employeeId: 'DBA001', password: 'Dba@1234' },
        { role: 'employee', employeeId: 'EMP001', password: 'Emp@1234' },
      ],
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshTokenDto & { reason?: string }, @Req() req: Request) {
    return this.authService.logout(dto.refreshToken, dto.reason, req);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN)
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}
