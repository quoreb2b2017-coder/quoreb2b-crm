import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ListMessagesDto,
  PresignChatAttachmentDto,
  SendChatMessageDto,
  StartChatDto,
} from './dto/chat.dto';

const CHAT_ROLES = [
  SystemRole.SUPER_ADMIN,
  SystemRole.ADMIN,
  SystemRole.EMPLOYEE,
  SystemRole.DB_ADMIN,
] as const;

type AuthUser = { id?: string; sub?: string; roles?: string[] };

@Controller({ path: 'chat', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CHAT_ROLES)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  private uid(user: AuthUser): string {
    return user.id ?? user.sub ?? '';
  }

  private roles(user: AuthUser): string[] {
    return user.roles ?? [];
  }

  @Get('contacts')
  listContacts(@CurrentUser() user: AuthUser) {
    return this.chatService.listContacts(this.uid(user));
  }

  @Get('conversations')
  listConversations(
    @CurrentUser() user: AuthUser,
    @Query('mode') mode?: 'mine' | 'oversight',
  ) {
    return this.chatService.listConversations(
      this.uid(user),
      this.roles(user),
      mode === 'oversight' ? 'oversight' : 'mine',
    );
  }

  @Post('conversations')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartChatDto) {
    return this.chatService.startOrGet(this.uid(user), dto.peerUserId);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ListMessagesDto,
  ) {
    return this.chatService.getMessages(
      this.uid(user),
      this.roles(user),
      id,
      query.limit,
      query.before,
    );
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(
      this.uid(user),
      id,
      dto.text,
      dto.attachments,
    );
  }

  @Post('conversations/:id/attachments/presign')
  presign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PresignChatAttachmentDto,
  ) {
    return this.chatService.presignAttachment(
      this.uid(user),
      id,
      dto.fileName,
      dto.contentType || 'application/octet-stream',
      dto.fileSizeBytes,
    );
  }

  @Post('conversations/:id/attachments/local')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadLocal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('key') key: string,
  ) {
    return this.chatService.saveLocalAttachment(
      this.uid(user),
      id,
      key,
      file?.originalname || 'file',
      file?.mimetype || 'application/octet-stream',
      file?.buffer,
    );
  }

  @Get('conversations/:id/messages/:messageId/attachments/:index/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.chatService.getAttachmentDownload(
      this.uid(user),
      this.roles(user),
      id,
      messageId,
      index,
    );
  }

  @Get('conversations/:id/messages/:messageId/attachments/:index/file')
  async streamLocalFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ) {
    const info = await this.chatService.getAttachmentDownload(
      this.uid(user),
      this.roles(user),
      id,
      messageId,
      index,
    );
    if (info.downloadUrl) {
      return res.redirect(info.downloadUrl);
    }
    const stream = this.chatService.openLocalAttachmentStream(info.key);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${info.fileName.replace(/"/g, '')}"`,
    );
    res.setHeader('Content-Type', info.mimeType || 'application/octet-stream');
    stream.pipe(res);
  }

  @Patch('conversations/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chatService.markRead(this.uid(user), this.roles(user), id);
  }
}
