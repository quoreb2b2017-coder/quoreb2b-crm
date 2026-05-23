# QuoreB2B CRM

Enterprise-grade B2B CRM monorepo.

## Architecture

| Service | Domain | Port (dev) |
|---------|--------|------------|
| CRM Frontend | crm.quoreb2b.com | 3000 |
| Client Frontend | app.intentmatics.com | 3001 |
| API Backend | api.quoreb2b.com | 4000 |

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand, Axios, Socket.io
- **Backend:** NestJS, MongoDB, Redis, BullMQ, Elasticsearch, JWT, RBAC
- **Infrastructure:** Docker, Nginx, GitHub Actions, Grafana, Sentry

## Quick Start

```bash
# Install dependencies
npm install

# Start infrastructure
npm run docker:up

# Configure environment
cp backend/.env.example backend/.env
cp frontend/crm-frontend/.env.example frontend/crm-frontend/.env.local
cp frontend/client-frontend/.env.example frontend/client-frontend/.env.local

# Run services (separate terminals)
npm run dev:api
npm run dev:crm
npm run dev:client
```

## Project Structure

```
quoreb2b-crm/
├── frontend/
│   ├── crm-frontend/      # Admin, Employee, DB Admin panels
│   └── client-frontend/   # Client dashboard, reports, billing
├── backend/               # NestJS API
├── docker/                # Docker Compose & services
├── nginx/                 # Reverse proxy config
└── docs/                  # Architecture & setup docs
```

See [docs/SETUP.md](docs/SETUP.md) for full setup commands and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design.
