export type NotePriority = 'low' | 'medium' | 'high';

export type NoteSidebarFilter = 'all' | 'pinned' | 'important' | 'archived';

export type NotesViewMode = 'grid' | 'list';

export interface PersonalNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  priority: NotePriority;
  isPinned: boolean;
  isArchived: boolean;
  reminderDate: string | null;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NotesListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface NotesListResponse {
  data: PersonalNote[];
  meta: NotesListMeta;
}

export interface NotesRecentResponse {
  pinned: PersonalNote[];
  recent: PersonalNote[];
}

export interface CreateNotePayload {
  title: string;
  content?: string;
  tags?: string[];
  priority?: NotePriority;
  isPinned?: boolean;
  reminderDate?: string | null;
}

export type UpdateNotePayload = Partial<CreateNotePayload>;

export interface ListNotesParams {
  page?: number;
  limit?: number;
  search?: string;
  priority?: NotePriority;
  tags?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  dateFrom?: string;
  dateTo?: string;
  filter?: NoteSidebarFilter;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
