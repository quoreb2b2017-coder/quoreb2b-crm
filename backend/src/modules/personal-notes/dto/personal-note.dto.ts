import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { NotePriority } from '../schemas/personal-note.schema';

function toBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

export class CreatePersonalNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(NotePriority)
  priority?: NotePriority;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsDateString()
  reminderDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentName?: string | null;
}

export class UpdatePersonalNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(NotePriority)
  priority?: NotePriority;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsDateString()
  reminderDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentName?: string | null;
}

export enum NoteSidebarFilter {
  ALL = 'all',
  PINNED = 'pinned',
  IMPORTANT = 'important',
  ARCHIVED = 'archived',
}

export class ListPersonalNotesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(NotePriority)
  priority?: NotePriority;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(NoteSidebarFilter)
  filter?: NoteSidebarFilter;
}

export class NoteIdParamDto {
  @IsMongoId()
  id: string;
}
