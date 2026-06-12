import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { FilterQuery, Model, Types } from 'mongoose';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds, stableHash } from '../../redis/cache.util';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreatePersonalNoteDto,
  ListPersonalNotesDto,
  NoteSidebarFilter,
  UpdatePersonalNoteDto,
} from './dto/personal-note.dto';
import {
  NotePriority,
  PersonalNote,
  PersonalNoteDocument,
} from './schemas/personal-note.schema';

@Injectable()
export class PersonalNotesService {
  constructor(
    @InjectModel(PersonalNote.name)
    private readonly noteModel: Model<PersonalNoteDocument>,
    private readonly cache: AppCacheService,
    private readonly config: ConfigService,
  ) {}

  private actorId(userId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ForbiddenException('Invalid user');
    }
    return new Types.ObjectId(userId);
  }

  private cachePrefix(userId: string): string {
    return `notes:user:${userId}:`;
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cache.delByPrefix(this.cachePrefix(userId));
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags?.length) return [];
    return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  }

  private buildFilter(userId: string, query: ListPersonalNotesDto): FilterQuery<PersonalNoteDocument> {
    const filter: FilterQuery<PersonalNoteDocument> = {
      createdBy: this.actorId(userId),
    };

    if (query.filter === NoteSidebarFilter.ARCHIVED || query.isArchived === true) {
      filter.isArchived = true;
    } else {
      filter.isArchived = false;
    }

    if (query.filter === NoteSidebarFilter.PINNED || query.isPinned === true) {
      filter.isPinned = true;
      filter.isArchived = false;
    }

    if (query.filter === NoteSidebarFilter.IMPORTANT) {
      filter.priority = NotePriority.HIGH;
      filter.isArchived = false;
    }

    if (query.priority) {
      filter.priority = query.priority;
    }

    if (query.tags) {
      const tagList = query.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (tagList.length) {
        filter.tags = { $in: tagList };
      }
    }

    if (query.dateFrom || query.dateTo) {
      filter.updatedAt = {};
      if (query.dateFrom) {
        filter.updatedAt.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        filter.updatedAt.$lte = end;
      }
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { title: { $regex: term, $options: 'i' } },
        { content: { $regex: term, $options: 'i' } },
        { tags: { $regex: term, $options: 'i' } },
      ];
    }

    return filter;
  }

  private serialize(note: PersonalNoteDocument | Record<string, unknown>) {
    const doc = note as PersonalNote & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };
    return {
      id: String(doc._id),
      title: doc.title,
      content: doc.content ?? '',
      tags: doc.tags ?? [],
      priority: doc.priority,
      isPinned: doc.isPinned,
      isArchived: doc.isArchived,
      reminderDate: doc.reminderDate ? new Date(doc.reminderDate).toISOString() : null,
      attachmentUrl: doc.attachmentUrl ?? null,
      attachmentName: doc.attachmentName ?? null,
      createdBy: String(doc.createdBy),
      createdAt: doc.createdAt?.toISOString?.() ?? null,
      updatedAt: doc.updatedAt?.toISOString?.() ?? null,
    };
  }

  async list(userId: string, query: ListPersonalNotesDto) {
    const cacheKey = `${this.cachePrefix(userId)}list:${stableHash(query)}`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'short'), async () => {
      const filter = this.buildFilter(userId, query);
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const sortBy = query.sortBy ?? 'updatedAt';
      const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

      const [items, total] = await Promise.all([
        this.noteModel
          .find(filter)
          .sort({ isPinned: -1, [sortBy]: sortOrder })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        this.noteModel.countDocuments(filter).exec(),
      ]);

      return paginate(
        items.map((n) => this.serialize(n)),
        total,
        query as PaginationDto,
      );
    });
  }

  async getRecent(userId: string) {
    const cacheKey = `${this.cachePrefix(userId)}recent`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'short'), async () => {
      const baseFilter = { createdBy: this.actorId(userId), isArchived: false };

      const [pinned, recent] = await Promise.all([
        this.noteModel
          .find({ ...baseFilter, isPinned: true })
          .sort({ updatedAt: -1 })
          .limit(12)
          .lean()
          .exec(),
        this.noteModel
          .find({ ...baseFilter, isPinned: false })
          .sort({ updatedAt: -1 })
          .limit(12)
          .lean()
          .exec(),
      ]);

      return {
        pinned: pinned.map((n) => this.serialize(n)),
        recent: recent.map((n) => this.serialize(n)),
      };
    });
  }

  async getTags(userId: string): Promise<string[]> {
    const cacheKey = `${this.cachePrefix(userId)}tags`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'medium'), async () => {
      const tags = await this.noteModel.distinct('tags', {
        createdBy: this.actorId(userId),
        isArchived: false,
      });
      return (tags as string[]).filter(Boolean).sort();
    });
  }

  async findOne(userId: string, noteId: string) {
    const note = await this.noteModel.findOne({
      _id: new Types.ObjectId(noteId),
      createdBy: this.actorId(userId),
    });
    if (!note) throw new NotFoundException('Note not found');
    return this.serialize(note);
  }

  async create(userId: string, dto: CreatePersonalNoteDto) {
    const note = await this.noteModel.create({
      title: dto.title.trim(),
      content: dto.content ?? '',
      tags: this.normalizeTags(dto.tags),
      priority: dto.priority ?? NotePriority.MEDIUM,
      isPinned: dto.isPinned ?? false,
      isArchived: false,
      reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
      attachmentUrl: dto.attachmentUrl ?? null,
      attachmentName: dto.attachmentName ?? null,
      createdBy: this.actorId(userId),
    });
    await this.invalidateUserCache(userId);
    return this.serialize(note);
  }

  async update(userId: string, noteId: string, dto: UpdatePersonalNoteDto) {
    const note = await this.noteModel.findOne({
      _id: new Types.ObjectId(noteId),
      createdBy: this.actorId(userId),
    });
    if (!note) throw new NotFoundException('Note not found');

    if (dto.title !== undefined) note.title = dto.title.trim();
    if (dto.content !== undefined) note.content = dto.content;
    if (dto.tags !== undefined) note.tags = this.normalizeTags(dto.tags);
    if (dto.priority !== undefined) note.priority = dto.priority;
    if (dto.isPinned !== undefined) note.isPinned = dto.isPinned;
    if (dto.reminderDate !== undefined) {
      note.reminderDate = dto.reminderDate ? new Date(dto.reminderDate) : null;
    }
    if (dto.attachmentUrl !== undefined) note.attachmentUrl = dto.attachmentUrl;
    if (dto.attachmentName !== undefined) note.attachmentName = dto.attachmentName;

    await note.save();
    await this.invalidateUserCache(userId);
    return this.serialize(note);
  }

  async remove(userId: string, noteId: string) {
    const result = await this.noteModel.deleteOne({
      _id: new Types.ObjectId(noteId),
      createdBy: this.actorId(userId),
    });
    if (!result.deletedCount) throw new NotFoundException('Note not found');
    await this.invalidateUserCache(userId);
    return { deleted: true };
  }

  async archive(userId: string, noteId: string) {
    const note = await this.noteModel.findOneAndUpdate(
      { _id: new Types.ObjectId(noteId), createdBy: this.actorId(userId) },
      { $set: { isArchived: true, isPinned: false } },
      { new: true },
    );
    if (!note) throw new NotFoundException('Note not found');
    await this.invalidateUserCache(userId);
    return this.serialize(note);
  }

  async restore(userId: string, noteId: string) {
    const note = await this.noteModel.findOneAndUpdate(
      { _id: new Types.ObjectId(noteId), createdBy: this.actorId(userId) },
      { $set: { isArchived: false } },
      { new: true },
    );
    if (!note) throw new NotFoundException('Note not found');
    await this.invalidateUserCache(userId);
    return this.serialize(note);
  }

  async setPinned(userId: string, noteId: string, pinned: boolean) {
    const note = await this.noteModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(noteId),
        createdBy: this.actorId(userId),
        isArchived: false,
      },
      { $set: { isPinned: pinned } },
      { new: true },
    );
    if (!note) throw new NotFoundException('Note not found');
    await this.invalidateUserCache(userId);
    return this.serialize(note);
  }

  async setAttachmentMeta(
    userId: string,
    noteId: string,
    attachmentUrl: string,
    attachmentName: string,
  ) {
    const note = await this.noteModel.findOneAndUpdate(
      { _id: new Types.ObjectId(noteId), createdBy: this.actorId(userId) },
      { $set: { attachmentUrl, attachmentName } },
      { new: true },
    );
    if (!note) throw new NotFoundException('Note not found');
    await this.invalidateUserCache(userId);
    return this.serialize(note);
  }
}
