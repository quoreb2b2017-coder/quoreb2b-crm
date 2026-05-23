# Folder Structure

```
quoreb2b-crm/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/
│   │   ├── common/
│   │   │   ├── constants/
│   │   │   ├── decorators/
│   │   │   ├── dto/
│   │   │   ├── filters/
│   │   │   ├── guards/
│   │   │   ├── interceptors/
│   │   │   ├── logger/
│   │   │   └── repositories/
│   │   ├── database/
│   │   ├── redis/
│   │   ├── elasticsearch/
│   │   ├── aws/
│   │   │   ├── s3/
│   │   │   └── ses/
│   │   ├── events/
│   │   ├── health/
│   │   └── modules/
│   │       ├── auth/
│   │       ├── users/
│   │       ├── roles/
│   │       ├── permissions/
│   │       ├── leads/
│   │       ├── companies/
│   │       ├── campaigns/
│   │       ├── email/
│   │       ├── whatsapp/
│   │       ├── automation/
│   │       ├── analytics/
│   │       ├── uploads/
│   │       ├── notifications/
│   │       ├── ai/
│   │       ├── activity-logs/
│   │       └── settings/
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── crm-frontend/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (protected)/admin/
│   │       │   ├── (protected)/employee/
│   │       │   ├── (protected)/db-admin/
│   │       │   └── login/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── lib/api/
│   │       ├── lib/socket/
│   │       ├── lib/utils/
│   │       ├── store/
│   │       ├── types/
│   │       └── middleware.ts
│   └── client-frontend/
│       └── src/
│           ├── app/(protected)/
│           │   ├── dashboard/
│           │   ├── leads/
│           │   ├── campaigns/
│           │   ├── reports/
│           │   ├── analytics/
│           │   └── billing/
│           ├── components/
│           ├── lib/
│           └── store/
├── docker/
│   ├── docker-compose.yml
│   ├── mongo-init.js
│   └── grafana/
├── nginx/
│   ├── nginx.conf
│   └── conf.d/
│       └── quoreb2b.conf
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   └── FOLDER_STRUCTURE.md
├── package.json
├── README.md
└── .gitignore
```
