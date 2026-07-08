import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListMessagesDto, SendChatMessageDto, StartChatDto } from './dto/chat.dto';

const CHAT_ROLES = [
  SystemRole.SUPER_ADMIN,
  SystemRole.ADMIN,
  SystemRole.EMPLOYEE,
  SystemRole.DB_ADMIN,
] as const;

@Controller({ path: 'chat', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CHAT_ROLES)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  private uid(user: { id?: string; sub?: string }): string {
    return user.id ?? user.sub ?? '';
  }

  @Get('contacts')
  listContacts(@CurrentUser() user: { id?: string; sub?: string }) {
    return this.chatService.listContacts(this.uid(user));
  }

  @Get('conversations')
  listConversations(@CurrentUser() user: { id?: string; sub?: string }) {
    return this.chatService.listConversations(this.uid(user));
  }

  @Post('conversations')
  start(
    @CurrentUser() user: { id?: string; sub?: string },
    @Body() dto: StartChatDto,
  ) {
    return this.chatService.startOrGet(this.uid(user), dto.peerUserId);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: { id?: string; sub?: string },
    @Param('id') id: string,
    @Query() query: ListMessagesDto,
  ) {
    return this.chatService.getMessages(this.uid(user), id, query.limit, query.before);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: { id?: string; sub?: string },
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(this.uid(user), id, dto.text);
  }

  @Patch('conversations/:id/read')
  markRead(@CurrentUser() user: { id?: string; sub?: string }, @Param('id') id: string) {
    return this.chatService.markRead(this.uid(user), id);
  }
}
