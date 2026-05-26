# QuoreB2B CRM - Deployment Guide

Complete deployment guide for AWS ECS (Backend) and Vercel (Frontend).

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Backend Deployment (AWS ECS)](#backend-deployment-aws-ecs)
4. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
5. [Database Setup](#database-setup)
6. [Environment Variables](#environment-variables)
7. [Post-Deployment](#post-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Vercel (Frontend)               │
│  crm.quoreb2b.com (3000)               │
│  app.intentmatics.com (3001)           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│      AWS ECS (Backend API)              │
│  api.quoreb2b.com (4000)               │
│  NestJS + Socket.io                    │
└────────────┬────────────────────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
┌────────┬────────┬──────────┐
│MongoDB │ Redis  │Elastic   │
│ Atlas  │ Cache  │ Search   │
└────────┴────────┴──────────┘
```

---

## Prerequisites

### Required AWS Services
- AWS Account with billing enabled
- AWS ECS (Elastic Container Service)
- AWS ECR (Elastic Container Registry)
- AWS RDS (for database) OR MongoDB Atlas
- AWS ElastiCache (for Redis)
- AWS Elasticsearch Service OR Elasticsearch Cloud
- AWS S3 (for file storage)
- AWS SES (for email)

### Required Tools
- Docker & Docker Compose (local development)
- AWS CLI configured with credentials
- Git
- Node.js 20+
- npm 10+

### Domain Setup
- Domain registered (e.g., quoreb2b.com)
- DNS configured for subdomains:
  - `crm.quoreb2b.com` → Vercel
  - `app.intentmatics.com` → Vercel
  - `api.quoreb2b.com` → AWS ECS

---

## Backend Deployment (AWS ECS)

### Step 1: Create AWS Resources

#### 1.1 Create ECR Repository
```bash
# Create repository for backend
aws ecr create-repository --repository-name quoreb2b-backend --region us-east-1

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

#### 1.2 Create RDS Database (MongoDB Atlas Alternative)
```bash
# Option A: Use MongoDB Atlas (Recommended - Easier)
# 1. Go to https://www.mongodb.com/cloud/atlas
# 2. Create cluster
# 3. Get connection string: mongodb+srv://<username>:<password>@cluster.mongodb.net/quoreb2b_crm

# Option B: Use AWS DocumentDB (MongoDB compatible)
# Use AWS Console to create DocumentDB cluster
```

#### 1.3 Create ElastiCache (Redis)
```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id quoreb2b-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --region us-east-1
```

#### 1.4 Create Elasticsearch Domain
```bash
# Use AWS Console or AWS CLI
# Domain name: quoreb2b-elasticsearch
# Version: 8.15.0
# Instance type: t3.small.elasticsearch
```

### Step 2: Build and Push Docker Image

```bash
# Navigate to backend
cd backend

# Build Docker image
docker build -t quoreb2b-backend:latest .

# Tag for ECR
docker tag quoreb2b-backend:latest <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/quoreb2b-backend:latest

# Push to ECR
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/quoreb2b-backend:latest
```

### Step 3: Create ECS Cluster and Task Definition

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name quoreb2b-cluster --region us-east-1

# Create task definition (see task-definition.json below)
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1

# Create ECS service
aws ecs create-service \
  --cluster quoreb2b-cluster \
  --service-name quoreb2b-backend-service \
  --task-definition quoreb2b-backend:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --region us-east-1
```

### Step 4: Configure Load Balancer

```bash
# Create Application Load Balancer
aws elbv2 create-load-balancer \
  --name quoreb2b-alb \
  --subnets subnet-xxx subnet-yyy \
  --security-groups sg-xxx \
  --scheme internet-facing \
  --type application \
  --region us-east-1

# Create target group
aws elbv2 create-target-group \
  --name quoreb2b-backend-tg \
  --protocol HTTP \
  --port 4000 \
  --vpc-id vpc-xxx \
  --region us-east-1

# Register targets and create listener (use AWS Console for easier setup)
```

---

## Frontend Deployment (Vercel)

### Step 1: Prepare Frontend for Vercel

```bash
# Navigate to frontend
cd frontend/crm-frontend

# Build locally to test
npm run build

# If build succeeds, ready for Vercel
```

### Step 2: Deploy to Vercel

#### Option A: Using Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy CRM Frontend
cd frontend/crm-frontend
vercel --prod

# Deploy Client Frontend
cd ../client-frontend
vercel --prod
```

#### Option B: Using GitHub Integration

1. Push code to GitHub
2. Go to https://vercel.com/new
3. Import repository
4. Select `frontend/crm-frontend` as root directory
5. Add environment variables (see below)
6. Deploy

### Step 3: Configure Custom Domains

1. Go to Vercel Dashboard
2. Select project
3. Go to Settings → Domains
4. Add custom domain:
   - `crm.quoreb2b.com` for CRM Frontend
   - `app.intentmatics.com` for Client Frontend
5. Update DNS records in domain registrar

---

## Database Setup

### MongoDB Atlas (Recommended)

```bash
# 1. Create account at https://www.mongodb.com/cloud/atlas
# 2. Create cluster
# 3. Create database user
# 4. Get connection string

# Connection string format:
mongodb+srv://<username>:<password>@cluster.mongodb.net/quoreb2b_crm?retryWrites=true&w=majority

# Example:
mongodb+srv://quoreb2b:your_password@cluster0.mongodb.net/quoreb2b_crm?retryWrites=true&w=majority
```

### Redis Setup

#### Option A: AWS ElastiCache
```bash
# Get endpoint from AWS Console
# Format: quoreb2b-redis.xxxxx.ng.0001.use1.cache.amazonaws.com:6379
redis://quoreb2b-redis.xxxxx.ng.0001.use1.cache.amazonaws.com:6379
```

#### Option B: Redis Cloud
```bash
# Create account at https://redis.com/try-free/
# Get connection string
redis://default:<password>@redis-xxxxx.c123.us-east-1-2.ec2.cloud.redislabs.com:12345
```

### Elasticsearch Setup

#### Option A: AWS Elasticsearch Service
```bash
# Get endpoint from AWS Console
# Format: https://quoreb2b-elasticsearch.xxxxx.us-east-1.es.amazonaws.com
https://quoreb2b-elasticsearch.xxxxx.us-east-1.es.amazonaws.com
```

#### Option B: Elasticsearch Cloud
```bash
# Create account at https://www.elastic.co/cloud
# Get endpoint
https://xxxxx.us-east-1.aws.cloud.es.io:9243
```

---

## Environment Variables

### Backend (.env for AWS ECS)

```env
# Application
NODE_ENV=production
PORT=4000

# Database
MONGODB_URI=mongodb+srv://quoreb2b:your_password@cluster0.mongodb.net/quoreb2b_crm?retryWrites=true&w=majority

# Redis
REDIS_URL=redis://default:your_password@redis-xxxxx.c123.us-east-1-2.ec2.cloud.redislabs.com:12345
REDIS_HOST=redis-xxxxx.c123.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your_password

# Elasticsearch
ELASTICSEARCH_NODE=https://xxxxx.us-east-1.aws.cloud.es.io:9243
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_chars_long_here
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# CORS
CORS_ORIGINS=https://crm.quoreb2b.com,https://app.intentmatics.com
SOCKET_CORS_ORIGINS=https://crm.quoreb2b.com,https://app.intentmatics.com

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=quoreb2b-uploads

# AWS SES (for email)
AWS_SES_REGION=us-east-1
AWS_SES_FROM_EMAIL=noreply@quoreb2b.com

# Sentry (Error Tracking)
SENTRY_DSN=https://your_sentry_key@sentry.io/your_project_id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Logging
LOG_LEVEL=info

# Database Admin
DB_ADMIN_EMAIL=admin@quoreb2b.com
DB_ADMIN_PASSWORD=your_secure_password
```

### Frontend - CRM (.env.local for Vercel)

```env
# API
NEXT_PUBLIC_API_URL=https://api.quoreb2b.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://api.quoreb2b.com

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://your_sentry_key@sentry.io/your_project_id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1

# App
NEXT_PUBLIC_APP_NAME=QuoreB2B CRM
NEXT_PUBLIC_APP_URL=https://crm.quoreb2b.com
```

### Frontend - Client (.env.local for Vercel)

```env
# API
NEXT_PUBLIC_API_URL=https://api.quoreb2b.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://api.quoreb2b.com

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://your_sentry_key@sentry.io/your_project_id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1

# App
NEXT_PUBLIC_APP_NAME=QuoreB2B Client
NEXT_PUBLIC_APP_URL=https://app.intentmatics.com
```

---

## Post-Deployment

### Step 1: Verify Deployments

```bash
# Check Backend API
curl https://api.quoreb2b.com/api/v1/health

# Check Frontend
curl https://crm.quoreb2b.com
curl https://app.intentmatics.com
```

### Step 2: Setup SSL/TLS

```bash
# AWS Certificate Manager (for backend)
# 1. Go to AWS Console → Certificate Manager
# 2. Request certificate for api.quoreb2b.com
# 3. Validate domain
# 4. Attach to ALB

# Vercel (automatic)
# Vercel automatically provides SSL for custom domains
```

### Step 3: Setup Monitoring

```bash
# Sentry
# 1. Create project at https://sentry.io
# 2. Add DSN to environment variables
# 3. Monitor errors in real-time

# CloudWatch (AWS)
# 1. Go to CloudWatch Dashboard
# 2. Create dashboard for ECS metrics
# 3. Set up alarms for CPU, memory, errors
```

### Step 4: Setup Auto-Scaling

```bash
# Create Auto Scaling Policy for ECS
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/quoreb2b-cluster/quoreb2b-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10 \
  --region us-east-1

# Create scaling policy
aws application-autoscaling put-scaling-policy \
  --policy-name quoreb2b-backend-scaling \
  --service-namespace ecs \
  --resource-id service/quoreb2b-cluster/quoreb2b-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json \
  --region us-east-1
```

---

## Troubleshooting

### Backend Issues

#### ECS Task Not Starting
```bash
# Check logs
aws logs tail /ecs/quoreb2b-backend --follow

# Check task status
aws ecs describe-tasks \
  --cluster quoreb2b-cluster \
  --tasks <task-arn> \
  --region us-east-1
```

#### Database Connection Failed
- Verify MongoDB Atlas IP whitelist includes ECS security group
- Check connection string format
- Verify credentials

#### Redis Connection Failed
- Check ElastiCache security group allows ECS
- Verify Redis endpoint and port
- Check password

### Frontend Issues

#### Build Fails on Vercel
- Check Node.js version (should be 20+)
- Verify all environment variables are set
- Check for TypeScript errors: `npm run type-check`

#### API Calls Failing
- Verify `NEXT_PUBLIC_API_URL` is correct
- Check CORS settings in backend
- Verify SSL certificates

#### Socket.io Not Connecting
- Verify `NEXT_PUBLIC_SOCKET_URL` is correct
- Check `SOCKET_CORS_ORIGINS` in backend
- Check browser console for errors

---

## Deployment Checklist

### Before Deployment
- [ ] All environment variables configured
- [ ] Database created and accessible
- [ ] Redis cluster created
- [ ] Elasticsearch domain created
- [ ] AWS S3 bucket created
- [ ] AWS SES verified
- [ ] Sentry project created
- [ ] Domains registered and DNS configured
- [ ] SSL certificates ready

### Backend Deployment
- [ ] Docker image built and tested locally
- [ ] ECR repository created
- [ ] Docker image pushed to ECR
- [ ] ECS cluster created
- [ ] Task definition registered
- [ ] ECS service created
- [ ] Load balancer configured
- [ ] Health checks passing
- [ ] Auto-scaling configured

### Frontend Deployment
- [ ] Build succeeds locally
- [ ] Vercel project created
- [ ] Environment variables added
- [ ] Custom domains configured
- [ ] DNS records updated
- [ ] SSL certificates active
- [ ] Deployment successful

### Post-Deployment
- [ ] API health check passing
- [ ] Frontend loading correctly
- [ ] Socket.io connecting
- [ ] Database queries working
- [ ] File uploads to S3 working
- [ ] Emails sending via SES
- [ ] Monitoring and alerts configured
- [ ] Backups configured

---

## Cost Estimation (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| AWS ECS | 2x t3.small | $30-50 |
| AWS RDS | db.t3.micro | $15-30 |
| AWS ElastiCache | cache.t3.micro | $15-25 |
| AWS Elasticsearch | t3.small | $20-40 |
| AWS S3 | 100GB storage | $2-5 |
| AWS SES | 50k emails | $0-10 |
| Vercel | Pro plan | $20 |
| MongoDB Atlas | M0 (free) | $0 |
| Redis Cloud | 30MB | $0 |
| **Total** | | **$102-180** |

---

## Support & Resources

- AWS Documentation: https://docs.aws.amazon.com
- Vercel Documentation: https://vercel.com/docs
- NestJS Documentation: https://docs.nestjs.com
- Next.js Documentation: https://nextjs.org/docs
- MongoDB Atlas: https://www.mongodb.com/cloud/atlas
- Sentry: https://sentry.io/welcome/

---

## Version Information

- **Version**: 1.0.0
- **Status**: Production Ready
- **Last Updated**: 2024
- **Compatibility**: Next.js 14, NestJS, MongoDB

---

**Ready to Deploy! Follow the steps above to get your application live.** 🚀
