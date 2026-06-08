# Deploy: Backend (AWS EC2) + Frontend (Vercel)

Your EC2 instance (ap-south-1 Mumbai):

| Item | Value |
|------|--------|
| Public IP | `13.232.248.18` |
| Instance | `i-0d00259abb5194cd5` (t3.small) |
| SSH key | `crm-key.pem` |
| Redis | Already configured on EC2 |

GitHub repo: https://github.com/quoreb2b2017-coder/quoreb2b-crm

---

## Part A — Backend on EC2

### A1. Security Group (AWS Console)

Inbound rules:

| Port | Source | Note |
|------|--------|------|
| 22 | Your IP | SSH |
| 80 | 0.0.0.0/0 | HTTP → Nginx |
| 443 | 0.0.0.0/0 | HTTPS → Nginx |

Do **not** open port 4000 publicly.

### A2. MongoDB Atlas

1. Atlas → **Network Access** → Add IP: `13.232.248.18`
2. Use your existing `MONGODB_URI` in production env

### A3. SSH into EC2

```bash
ssh -i crm-key.pem ubuntu@13.232.248.18
```

### A4. One-time setup

```bash
git clone https://github.com/quoreb2b2017-coder/quoreb2b-crm.git ~/quoreb2b-crm
cd ~/quoreb2b-crm
bash deploy/ec2/setup-ec2.sh
```

### A5. Production environment

```bash
nano ~/quoreb2b-crm/backend/.env.production
```

Copy from `backend/.env.production.example` and set:

- `MONGODB_URI` — Atlas connection string
- `REDIS_PASSWORD` — same as your EC2 Redis password
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — **new** strong secrets (not local dev)
- `CORS_ORIGINS` — add Vercel URL after frontend deploy (see Part B)

Generate secrets:

```bash
openssl rand -base64 48
```

### A6. Deploy backend

```bash
bash ~/quoreb2b-crm/deploy/ec2/deploy-backend.sh
```

Check:

```bash
curl http://127.0.0.1:4000/api/v1/health
docker logs -f quoreb2b-api
```

### A7. DNS + SSL (required for Vercel HTTPS frontend)

Vercel serves **HTTPS**. Browser blocks HTTP API calls from HTTPS pages (mixed content).

1. DNS A record: `api.quoreb2b.com` → `13.232.248.18`
2. On EC2:

```bash
sudo certbot --nginx -d api.quoreb2b.com
```

3. Test:

```bash
curl https://api.quoreb2b.com/api/v1/health
```

**Until SSL is ready**, API will not work from Vercel production URL.

### A8. Update deploy (after code changes)

```bash
bash ~/quoreb2b-crm/deploy/ec2/deploy-backend.sh
```

---

## Part B — Frontend on Vercel

### B1. Install Vercel CLI (local machine)

```bash
npm i -g vercel
vercel login
```

### B2. Deploy CRM frontend

```bash
cd frontend/crm-frontend
vercel
```

When prompted:

- **Set up and deploy?** Yes
- **Which scope?** Your account
- **Link to existing project?** No (first time)
- **Project name?** `quoreb2b-crm` (or your choice)
- **Directory?** `./` (you are already in crm-frontend)

### B3. Vercel Dashboard settings

Go to https://vercel.com → your project → **Settings**

**General → Root Directory:** `frontend/crm-frontend` (if deploying from monorepo via GitHub import)

**Environment Variables** (Production):

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_API_URL` | `https://api.quoreb2b.com/api/v1` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://api.quoreb2b.com` |
| `NEXT_PUBLIC_APP_URL` | `https://crm.quoreb2b.com` (or your Vercel URL) |
| `NEXT_PUBLIC_APP_NAME` | `QuoreB2B CRM` |

Redeploy after saving env vars.

### B4. Deploy via GitHub (recommended)

1. Vercel → **Add New Project** → Import `quoreb2b2017-coder/quoreb2b-crm`
2. **Root Directory:** `frontend/crm-frontend`
3. Framework: Next.js (auto-detected)
4. Add env vars from table above
5. Deploy

### B5. Custom domain (optional)

Vercel → Domains → Add `crm.quoreb2b.com`  
DNS: CNAME `crm` → `cname.vercel-dns.com`

### B6. Update backend CORS

After Vercel deploy, copy your URL (e.g. `https://quoreb2b-crm.vercel.app`).

On EC2, edit `backend/.env.production`:

```env
CORS_ORIGINS=https://crm.quoreb2b.com,https://quoreb2b-crm.vercel.app
SOCKET_CORS_ORIGINS=https://crm.quoreb2b.com,https://quoreb2b-crm.vercel.app
```

Redeploy backend:

```bash
bash ~/quoreb2b-crm/deploy/ec2/deploy-backend.sh
```

---

## Part C — Verification checklist

- [ ] `curl https://api.quoreb2b.com/api/v1/health` → `status: ok`
- [ ] Docker logs show `Redis OK` and `MongoDB index sync complete`
- [ ] Vercel build succeeded
- [ ] Login works on Vercel URL
- [ ] Notification bell / WebSocket connects (check browser console)
- [ ] Atlas IP `13.232.248.18` whitelisted

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API connection refused | `docker ps`, `docker logs quoreb2b-api` |
| MongoDB timeout | Atlas IP whitelist + correct `MONGODB_URI` |
| Redis error | `REDIS_HOST=127.0.0.1`, password matches Redis config |
| CORS error in browser | Add exact Vercel URL to `CORS_ORIGINS` |
| Mixed content / blocked API | Use HTTPS on API (`certbot`) — not raw IP HTTP |
| WebSocket failed | Nginx `/events` block + `SOCKET_CORS_ORIGINS` |

---

## Quick reference

```bash
# EC2 SSH
ssh -i crm-key.pem ubuntu@13.232.248.18

# Deploy / update backend
bash ~/quoreb2b-crm/deploy/ec2/deploy-backend.sh

# Backend logs
docker logs -f quoreb2b-api

# Nginx reload
sudo nginx -t && sudo systemctl reload nginx
```
