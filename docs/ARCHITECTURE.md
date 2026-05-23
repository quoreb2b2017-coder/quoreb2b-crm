# QuoreB2B CRM - System Architecture

## Overview

Enterprise B2B CRM monorepo with three public-facing applications behind Nginx reverse proxy.

```
                    ┌─────────────────────────────────────────┐
                    │              Nginx (443/80)              │
                    └─────────────────────────────────────────┘
                      │              │              │
          crm.quoreb2b.com   app.intentmatics.com   api.quoreb2b.com
                      │              │              │
              ┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
              │ CRM Frontend │ │  Client    │ │  NestJS    │
              │  (Next.js)   │ │  Frontend  │ │   API      │
              │   :3000      │ │   :3001    │ │   :4000    │
              └──────────────┘ └────────────┘ └─────┬──────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
              ┌─────▼─────┐                  ┌──────▼──────┐                 ┌───────▼───────┐
              │  MongoDB  │                  │    Redis    │                 │ Elasticsearch │
              └───────────┘                  │  + BullMQ   │                 └───────────────┘
                                             └─────────────┘
                                                    │
                                             ┌──────▼──────┐
                                             │  AWS S3/SES │
                                             └─────────────┘
```

## Domains

| Application | Domain | Purpose |
|-------------|--------|---------|
| CRM Frontend | crm.quoreb2b.com | Admin, Employee, DB Admin panels |
| Client Frontend | app.intentmatics.com | Client dashboard, billing, campaigns |
| API | api.quoreb2b.com | REST API + WebSocket |

## Backend Architecture

### Layers

1. **Controllers** - HTTP routing, DTO validation, guards
2. **Services** - Business logic
3. **Repositories** - MongoDB data access (repository pattern)
4. **Infrastructure** - Redis, Elasticsearch, AWS, BullMQ

### Security

- JWT access tokens (15m) + refresh tokens (7d)
- Global `JwtAuthGuard` + `RolesGuard` (RBAC)
- Helmet, CORS, rate limiting (Throttler)
- Validation pipes on all inputs

### Core Modules

`auth`, `users`, `roles`, `permissions`, `leads`, `companies`, `campaigns`, `email`, `whatsapp`, `automation`, `analytics`, `uploads`, `notifications`, `ai`, `activity-logs`, `settings`

### Real-time

- Socket.io namespace `/events`
- JWT auth on WebSocket handshake
- User-scoped rooms: `user:{userId}`

### Queues (BullMQ)

- `email` - AWS SES delivery
- `whatsapp` - Message dispatch
- `automation` - Workflow triggers

## Frontend Architecture

### CRM Frontend (`crm.quoreb2b.com`)

```
src/
├── app/
│   ├── (protected)/admin/      # Super Admin + Admin
│   ├── (protected)/employee/   # Employee panel
│   └── (protected)/db-admin/   # Database admin
├── components/                 # Shared UI
├── lib/api/                    # Axios services
├── store/                      # Zustand auth store
├── hooks/                      # Custom hooks
├── types/                      # TypeScript types
└── middleware.ts               # Auth + RBAC routing
```

### Client Frontend (`app.intentmatics.com`)

```
src/
├── app/(protected)/
│   ├── dashboard/
│   ├── leads/
│   ├── campaigns/
│   ├── reports/
│   ├── analytics/
│   └── billing/
```

## Observability

- **Sentry** - Error tracking (backend + frontends)
- **Grafana** - Metrics dashboards (:3002)
- **Winston** - Structured API logging

## Data Flow Example: Lead Creation

1. Client POST `/api/v1/leads`
2. `JwtAuthGuard` validates token
3. `RolesGuard` checks permissions
4. `LeadsService` creates MongoDB document
5. Document indexed in Elasticsearch
6. Optional: notification via Socket.io
7. Optional: automation workflow queued in BullMQ
