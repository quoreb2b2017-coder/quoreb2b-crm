# QuoreB2B CRM - Setup Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Docker & Docker Compose
- Git

## 1. Clone & Install

```bash
git clone <repository-url> quoreb2b-crm
cd quoreb2b-crm
npm install
```

## 2. Environment Configuration

```bash
# Backend
cp backend/.env.example backend/.env



# CRM Frontend
cp frontend/crm-frontend/.env.example frontend/crm-frontend/.env.local

# Client Frontend
cp frontend/client-frontend/.env.example frontend/client-frontend/.env.local
```

Edit each `.env` file with your secrets (JWT keys, AWS credentials, Sentry DSN).

## 3. Start Infrastructure (Docker)

```bash
npm run docker:up
# or
docker compose -f docker/docker-compose.yml up -d mongodb redis elasticsearch
```

Wait for services:
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`
- Elasticsearch: `localhost:9200`

## 4. Run Development Servers

Open three terminals:

```bash
# Terminal 1 - API
npm run dev:api

# Terminal 2 - CRM Frontend (port 3000)
npm run dev:crm

# Terminal 3 - Client Frontend (port 3001)
npm run dev:client
```

## 5. Access Applications

| App | URL |
|-----|-----|
| CRM Frontend | http://localhost:3000 |
| Client Frontend | http://localhost:3001 |
| API | http://localhost:4000/api/v1 |
| API Health | http://localhost:4000/api/v1/health |
| Grafana | http://localhost:3002 |

## 6. Full Stack with Docker

```bash
# Copy env files first
cp backend/.env.example backend/.env

docker compose -f docker/docker-compose.yml up -d --build
```

## 7. Production Deployment

1. Set production env vars (strong JWT secrets, AWS keys, Sentry DSN)
2. Configure SSL certificates in `nginx/ssl/`
3. Update `nginx/conf.d/quoreb2b.conf` for HTTPS
4. Push to `main` branch → GitHub Actions CI/CD runs
5. Deploy Docker images to your orchestrator (ECS/K8s)

## API Endpoints (v1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/users` | List users (admin) |
| GET/POST | `/api/v1/leads` | Leads CRUD |
| GET/POST | `/api/v1/campaigns` | Campaigns |
| GET | `/api/v1/analytics/dashboard` | Dashboard stats |
| POST | `/api/v1/uploads` | File upload (S3) |
| GET | `/api/v1/notifications` | User notifications |

## RBAC Roles

| Role | Panel Access |
|------|--------------|
| `super_admin` | All panels + system config |
| `admin` | Admin panel |
| `employee` | Employee panel |
| `db_admin` | Database admin panel |
| `client` | Client frontend only |

## Troubleshooting

**MongoDB connection failed**
- Verify `MONGODB_URI` matches Docker credentials
- Check container: `docker logs quoreb2b-mongodb`

**Elasticsearch not ready**
- Wait 30-60s after container start
- Check: `curl http://localhost:9200`

**CORS errors**
- Add frontend URL to `CORS_ORIGINS` in backend `.env`

**Socket.io disconnects**
- Verify `NEXT_PUBLIC_SOCKET_URL` points to API
- Check `SOCKET_CORS_ORIGINS` in backend `.env`
