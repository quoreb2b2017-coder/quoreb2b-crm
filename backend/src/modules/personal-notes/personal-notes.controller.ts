import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { PersonalNotesService } from './personal-notes.service';
import {
  CreatePersonalNoteDto,
  ListPersonalNotesDto,
  UpdatePersonalNoteDto,
} from './dto/personal-note.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'personal-notes');
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv']);

function ensureUploadDir(userId: string): string {
  const dir = join(UPLOAD_DIR, userId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

@Controller({ path: 'personal-notes', version: '1' })
@UseGuards(JwtAuthGuard)
export class PersonalNotesController {
  constructor(private readonly notesService: PersonalNotesService) {}

  private userId(user: { id?: string; sub?: string }): string {
    return user.id ?? user.sub ?? '';
  }

  @Get()
  list(@CurrentUser() user: { id?: string; sub?: string }, @Query() query: ListPersonalNotesDto) {
    return this.notesService.list(this.userId(user), query);
  }

  @Get('recent')
  getRecent(@CurrentUser() user: { id?: string; sub?: string }) {
    return this.notesService.getRecent(this.userId(user));
  }

  @Get('tags')
  getTags(@CurrentUser() user: { id?: string; sub?: string }) {
    return this.notesService.getTags(this.userId(user));
  }

  @Get(':id')
  findOne(@CurrentUser() user: { id?: string; sub?: string }, @Param('id') id: string) {
    return this.notesService.findOne(this.userId(user), id);
  }

  @Post()
  create(@CurrentUser() user: { id?: string; sub?: string }, @Body() dto: CreatePersonalNoteDto) {
    return this.notesService.create(this.userId(user), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id?: string; sub?: string },
    @Param('id') id: string,
    @Body() dto: UpdatePersonalNoteDto,
  ) {
    return this.notesService.update(this.userId(user), id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id?: string; sub?: string }, @Param('id') id: string) {
    return this.notesService.remove(this.userId(user), id);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: { id?: string; sub?: string }, @Param('id') id: string) {
    return this.notesService.archive(this.userId(user), id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: { id?: string; sub?: string }, @Param('id') id: string) {
    return this.notesService.restore(this.userId(user), id);
  }

  @Post(':id/pin')
  pin(@CurrentUser() user: { id?: string; sub?: string }, @Param('id') id: string) {
    return this.notesService.setPinned(this.userId(user), id, true);
  }

  @Post(':id/unpin')
  unpin(@CurrentUser() user: { id?: string; sub?: string }, @Param('id') id: string) {
    return this.notesService.setPinned(this.userId(user), id, false);
  }

  @Post(':id/attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES },
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const userId = (req as { user?: { id?: string; sub?: string } }).user?.id
            ?? (req as { user?: { id?: string; sub?: string } }).user?.sub
            ?? 'unknown';
          cb(null, ensureUploadDir(userId));
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
          return cb(new BadRequestException('File type not allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadAttachment(
    @CurrentUser() user: { id?: string; sub?: string },
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const userId = this.userId(user);
    const relativePath = `/uploads/personal-notes/${userId}/${file.filename}`;
    return this.notesService.setAttachmentMeta(userId, id, relativePath, file.originalname);
  }
}
