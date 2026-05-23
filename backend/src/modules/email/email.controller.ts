import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller({ path: 'email', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('send')
  send(@Body() body: { to: string; subject: string; html: string; text?: string }) {
    return this.emailService.send(body);
  }
}
