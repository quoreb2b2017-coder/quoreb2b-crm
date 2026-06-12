# Personal Notes API

Base URL: `/api/v1/personal-notes`  
Auth: `Authorization: Bearer <JWT>`

Each user only sees and manages **their own** notes (`createdBy` = logged-in user).  
Works for **employee**, **admin**, and **db_admin** roles.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/personal-notes` | Paginated list with filters |
| `GET` | `/personal-notes/recent` | Pinned + recent notes (Redis cached) |
| `GET` | `/personal-notes/tags` | Distinct tags for current user |
| `GET` | `/personal-notes/:id` | Single note |
| `POST` | `/personal-notes` | Create note |
| `PATCH` | `/personal-notes/:id` | Update note |
| `DELETE` | `/personal-notes/:id` | Delete note permanently |
| `POST` | `/personal-notes/:id/archive` | Archive note |
| `POST` | `/personal-notes/:id/restore` | Restore from archive |
| `POST` | `/personal-notes/:id/pin` | Pin note |
| `POST` | `/personal-notes/:id/unpin` | Unpin note |
| `POST` | `/personal-notes/:id/attachment` | Upload file (`multipart/form-data`, field `file`) |

## List query parameters

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page (default 1) |
| `limit` | number | Page size (default 20, max 1000) |
| `search` | string | Search title, content, tags |
| `priority` | `low` \| `medium` \| `high` | Filter by priority |
| `tags` | string | Comma-separated tags |
| `isArchived` | boolean | Archived filter |
| `isPinned` | boolean | Pinned filter |
| `dateFrom` | ISO date | Updated on/after |
| `dateTo` | ISO date | Updated on/before |
| `filter` | `all` \| `pinned` \| `important` \| `archived` | Sidebar presets |
| `sortBy` | string | Default `updatedAt` |
| `sortOrder` | `asc` \| `desc` | Default `desc` |

## Create / Update body

```json
{
  "title": "Client follow-up",
  "content": "<p>Call ABC Corp</p>",
  "tags": ["client", "urgent"],
  "priority": "high",
  "isPinned": false,
  "reminderDate": "2026-06-15T10:00:00.000Z",
  "attachmentUrl": null,
  "attachmentName": null
}
```

## Response shape

```json
{
  "success": true,
  "data": {
    "id": "...",
    "title": "...",
    "content": "...",
    "tags": [],
    "priority": "medium",
    "isPinned": false,
    "isArchived": false,
    "reminderDate": null,
    "attachmentUrl": "/uploads/personal-notes/<userId>/<file>",
    "attachmentName": "report.pdf",
    "createdBy": "...",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "meta": { "total": 0, "page": 1, "limit": 20, "hasNextPage": false }
}
```

## Redis cache keys

- `notes:user:{userId}:list:{hash}` — list/search results (short TTL)
- `notes:user:{userId}:recent` — pinned + recent (short TTL)
- `notes:user:{userId}:tags` — tag list (medium TTL)

Invalidated on create, update, delete, archive, restore, pin, attachment upload.

## Attachments

- Max size: 5 MB
- Allowed: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.txt`, `.csv`
- Served at `/uploads/personal-notes/{userId}/{filename}`
