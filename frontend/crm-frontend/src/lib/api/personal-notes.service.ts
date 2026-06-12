import apiClient from '@/lib/api/client';
import type {
  CreateNotePayload,
  ListNotesParams,
  NotesListResponse,
  NotesRecentResponse,
  PersonalNote,
  UpdateNotePayload,
} from '@/types/personal-notes';

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T; meta?: unknown };
  return (body?.data ?? body) as T;
}

function unwrapPaginated(response: { data: unknown }): NotesListResponse {
  const body = response.data as {
    data?: PersonalNote[];
    meta?: NotesListResponse['meta'];
    success?: boolean;
  };
  if (body?.data && Array.isArray(body.data) && body.meta) {
    return { data: body.data, meta: body.meta };
  }
  const nested = body as unknown as { data: { data: PersonalNote[]; meta: NotesListResponse['meta'] } };
  if (nested?.data?.data) {
    return { data: nested.data.data, meta: nested.data.meta };
  }
  return { data: (body?.data as PersonalNote[]) ?? [], meta: body.meta as NotesListResponse['meta'] };
}

export const personalNotesService = {
  async list(params: ListNotesParams = {}): Promise<NotesListResponse> {
    const res = await apiClient.get('personal-notes', { params });
    return unwrapPaginated(res);
  },

  async getRecent(): Promise<NotesRecentResponse> {
    const res = await apiClient.get('personal-notes/recent');
    return unwrap<NotesRecentResponse>(res);
  },

  async getTags(): Promise<string[]> {
    const res = await apiClient.get('personal-notes/tags');
    return unwrap<string[]>(res);
  },

  async getById(id: string): Promise<PersonalNote> {
    const res = await apiClient.get(`personal-notes/${id}`);
    return unwrap<PersonalNote>(res);
  },

  async create(payload: CreateNotePayload): Promise<PersonalNote> {
    const res = await apiClient.post('personal-notes', payload);
    return unwrap<PersonalNote>(res);
  },

  async update(id: string, payload: UpdateNotePayload): Promise<PersonalNote> {
    const res = await apiClient.patch(`personal-notes/${id}`, payload);
    return unwrap<PersonalNote>(res);
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`personal-notes/${id}`);
  },

  async archive(id: string): Promise<PersonalNote> {
    const res = await apiClient.post(`personal-notes/${id}/archive`);
    return unwrap<PersonalNote>(res);
  },

  async restore(id: string): Promise<PersonalNote> {
    const res = await apiClient.post(`personal-notes/${id}/restore`);
    return unwrap<PersonalNote>(res);
  },

  async pin(id: string): Promise<PersonalNote> {
    const res = await apiClient.post(`personal-notes/${id}/pin`);
    return unwrap<PersonalNote>(res);
  },

  async unpin(id: string): Promise<PersonalNote> {
    const res = await apiClient.post(`personal-notes/${id}/unpin`);
    return unwrap<PersonalNote>(res);
  },
};
