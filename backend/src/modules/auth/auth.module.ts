import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { UsersModule } from '../users/users.module';
import { jwtConfig } from '../../config/jwt.config';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    UsersModule,
    ActivityLogsModule,
    AttendanceModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: jwtConfig,
    }),
    MongooseModule.forFeature([{ name: RefreshToken.name, schema: RefreshTokenSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
