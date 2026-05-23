import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';

export const jwtConfig = (config: ConfigService): JwtModuleOptions => ({
  secret: config.get<string>('JWT_ACCESS_SECRET'),
  signOptions: {
    expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
  },
});
