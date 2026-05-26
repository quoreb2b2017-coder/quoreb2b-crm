# Setup & Configuration Documentation

Complete setup and configuration guides for the QuoreB2B CRM system.

## Quick Links

- **[Setup Complete](SETUP_COMPLETE.md)** - Complete setup guide

## Prerequisites

- Node.js 20+
- npm 10+
- Docker & Docker Compose
- Git

## Quick Start (3 Steps)

```bash
# 1. Clone & Install
git clone <repository-url> quoreb2b-crm
cd quoreb2b-crm
npm install

# 2. Configure Environment
cp backend/.env.example backend/.env
cp frontend/crm-frontend/.env.example frontend/crm-frontend/.env.local
cp frontend/client-frontend/.env.example frontend/client-frontend/.env.local

# 3. Start Services
npm run docker:up
npm run dev:api      # Terminal 1
npm run dev:crm      # Terminal 2
npm run dev:client   # Terminal 3
```

## Environment Configuration

### Backend (.env)
```
MONGODB_URI=mongodb://localhost:27017/quoreb2b
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
PORT=4000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
SOCKET_CORS_ORIGINS=http://localhost:3000,http://localhost:3001
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket_name
SENTRY_DSN=your_sentry_dsn
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

## Access Applications

| App | URL |
|-----|-----|
| CRM Frontend | http://localhost:3000 |
| Client Frontend | http://localhost:3001 |
| API | http://localhost:4000/api/v1 |
| Grafana | http://localhost:3002 |

## Verify Installation

```bash
# Check API health
curl http://localhost:4000/api/v1/health

# Check Elasticsearch
curl http://localhost:9200

# Check MongoDB
mongosh mongodb://localhost:27017/quoreb2b
```

## Common Issues

### ENOSPC Error (Disk Full)
```bash
npm cache clean --force
rm -rf node_modules
npm install
```

### MongoDB Connection Failed
- Verify `MONGODB_URI` matches Docker credentials
- Check container: `docker logs quoreb2b-mongodb`
- Ensure MongoDB is running: `docker ps | grep mongodb`

### Elasticsearch Not Ready
- Wait 30-60s after container start
- Check: `curl http://localhost:9200`
- View logs: `docker logs quoreb2b-elasticsearch`

### CORS Errors
- Add frontend URL to `CORS_ORIGINS` in backend `.env`
- Verify `NEXT_PUBLIC_API_URL` in frontend `.env.local`

### Socket.io Disconnects
- Verify `NEXT_PUBLIC_SOCKET_URL` points to API
- Check `SOCKET_CORS_ORIGINS` in backend `.env`
- Check browser console for errors
