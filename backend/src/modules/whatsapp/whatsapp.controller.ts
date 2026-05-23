import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller({ path: 'whatsapp', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Post('send')
  send(@Body() body: { to: string; message: string }) {
    return this.whatsappService.sendMessage(body);
  }
}
