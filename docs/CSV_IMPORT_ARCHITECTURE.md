# Enterprise CSV Import Architecture

Production-grade CSV import for 10 lakh+ (1M+) records — S3 upload, BullMQ workers, streaming parse, MongoDB `bulkWrite`, pause/resume/cancel, and horizontal scale.

## Folder structure

```
backend/src/modules/csv-import/
├── csv-import.module.ts          # Dynamic module (BullMQ + Redis or noop)
├── csv-import.controller.ts      # REST API
├── csv-import.service.ts         # Job orchestration, presign, control
├── csv-import.constants.ts
├── csv-import.types.ts
├── dto/
│   ├── initiate-csv-import.dto.ts
│   └── csv-import-control.dto.ts
├── schemas/
│   ├── csv-import-job.schema.ts       # Durable job state (MongoDB)
│   └── csv-import-failed-row.schema.ts
├── repositories/
│   └── csv-import-job.repository.ts
├── services/
│   ├── csv-import-s3.service.ts           # Presign, multipart upload, streams
│   ├── csv-import-stream.service.ts       # Line-by-line CSV (no full-file RAM)
│   ├── csv-import-batch-writer.service.ts # MongoDB bulkWrite → master_data_chunks
│   ├── csv-import-processor.service.ts    # Orchestrator + batch logic
│   ├── csv-import-queue.service.ts        # BullMQ enqueue
│   ├── csv-import-queue.service.noop.ts
│   └── csv-import-lock.service.ts         # Redis lock per masterKey
└── workers/
    └── csv-import.worker.ts               # Orchestrator + batch BullMQ processors
```

## Architecture diagram

```
┌─────────────┐     presign PUT      ┌──────────────┐
│  Next.js    │ ───────────────────► │   AWS S3     │
│  Frontend   │                      │  (2GB+ CSV)  │
└──────┬──────┘                      └──────┬───────┘
       │ POST /csv-imports/:id/start       │
       ▼                                   │
┌─────────────┐     enqueue          ┌─────▼────────┐
│  NestJS API │ ───────────────────► │    Redis     │
│  (returns   │                      │   BullMQ     │
│   jobId)    │                      └─────┬────────┘
└─────────────┘                            │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
            │ Orchestrator  │      │ Batch worker  │      │ Batch worker  │
            │ Worker (×2)   │─────►│   (×4)        │      │   (×4)        │
            │ stream S3 CSV │      │ bulkWrite     │      │ bulkWrite     │
            └───────┬───────┘      └───────┬───────┘      └───────┬───────┘
                    │                      │                      │
                    └──────────────────────┼──────────────────────┘
                                           ▼
                              ┌────────────────────────┐
                              │ MongoDB Atlas M10      │
                              │ csv_import_jobs        │
                              │ csv_import_failed_rows │
                              │ master_data_chunks     │
                              └────────────────────────┘
```

## API flow

### Option A — Presigned S3 (recommended for 100MB–2GB+)

1. `POST /api/v1/csv-imports/presign`  
   Body: `{ fileName, fileSizeBytes, mode, batchSize? }`  
   Returns: `{ jobId, uploadUrl, s3Key, bucket, expiresIn }`

2. Browser uploads CSV directly to S3 via `PUT uploadUrl`

3. `POST /api/v1/csv-imports/:jobId/start`  
   Returns immediately: `{ jobId, status: "queued" }`

4. Poll `GET /api/v1/csv-imports/:jobId` for progress

### Option B — Server upload (streams to S3 then queues)

`POST /api/v1/csv-imports/upload` — `multipart/form-data` with `file`, `mode`, optional `batchSize`  
Returns `{ jobId }` immediately after S3 upload completes.

### Control

- `POST /api/v1/csv-imports/:jobId/control` — `{ action: "pause" | "resume" | "cancel" }`
- `GET /api/v1/csv-imports/:jobId/errors/download-url` — presigned error CSV

## Progress fields

| Field | Meaning |
|-------|---------|
| `progress.processed` | Rows read from CSV |
| `progress.success` | Rows saved to MongoDB |
| `progress.failed` | Rows in `csv_import_failed_rows` |
| `progress.remaining` | `totalEstimate - processed` |
| `checkpoint.lastRowNumber` | Resume point (skip rows on restart) |
| `checkpoint.nextChunkIndex` | Next `master_data_chunks.chunkIndex` |

## Configuration

```env
# S3
AWS_REGION=ap-south-1
AWS_S3_BUCKET=quoreb2b-crm-imports
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
CSV_IMPORT_S3_PREFIX=csv-imports

# Import tuning
CSV_IMPORT_ENABLED=true
CSV_IMPORT_BATCH_SIZE=1000          # 500–2000 rows per read batch
CSV_IMPORT_WRITE_CONCURRENCY=2      # >1 enables parallel batch queue
CSV_IMPORT_QUEUE_CONCURRENCY=2      # Orchestrator workers
CSV_IMPORT_BATCH_QUEUE_CONCURRENCY=4
CSV_IMPORT_MAX_RETRIES=3
CSV_IMPORT_MAX_FILE_BYTES=2147483648

# Required
REDIS_ENABLED=true
MONGODB_MAX_POOL_SIZE=50
MONGODB_MIN_POOL_SIZE=10
```

## AWS infrastructure recommendations

| Component | Recommendation |
|-----------|----------------|
| **EC2 API** | `t3.large` minimum; `c6i.xlarge` for heavy import periods |
| **Dedicated workers** | Separate Docker service `csv-import-worker` with same image, `CSV_IMPORT_QUEUE_CONCURRENCY=4` |
| **S3** | Standard tier; lifecycle rule to delete `csv-imports/*` after 30 days |
| **S3 transfer** | Presigned PUT from browser — bypasses API memory entirely |
| **MongoDB M10** | `maxPoolSize=50`; ensure `{ masterKey, chunkIndex }` unique index exists |
| **Redis** | `cache.t3.small` or ElastiCache; `maxmemory-policy=noeviction` for BullMQ |
| **Nginx** | `client_max_body_size 0` for presign path; API upload optional |
| **Autoscaling** | Scale worker containers on BullMQ queue depth (CloudWatch custom metric) |
| **Docker** | `NODE_OPTIONS=--max-old-space-size=2048`; mount volume only for local fallback |

### Docker Compose worker (example)

```yaml
csv-import-worker:
  image: quoreb2b-api:latest
  command: node dist/main.js
  environment:
    REDIS_ENABLED: "true"
    CSV_IMPORT_QUEUE_CONCURRENCY: "4"
    CSV_IMPORT_BATCH_QUEUE_CONCURRENCY: "8"
    NODE_OPTIONS: --max-old-space-size=2048
  deploy:
    replicas: 2
```

## Memory profile

- CSV read: **O(batchSize)** — one batch in RAM (~1000 rows)
- S3 download: **streaming** — no full 2GB buffer
- MongoDB write: **bulkWrite** upserts in chunks of 1000 rows
- Failed rows: flushed every 200 errors to MongoDB

## Migration from legacy `import-jobs`

Legacy path (`POST /master-data/import-jobs`) uses disk + in-process workers.  
New enterprise path: `POST /csv-imports/*` for CSV files ≥512KB or when S3+Redis configured.

Frontend should:
1. Presign → S3 upload → start job
2. Poll `/csv-imports/:jobId` (durable MongoDB state vs Redis-only legacy jobs)

## SOLID / NestJS patterns

- **Single responsibility**: S3, stream, writer, processor, queue separated
- **Repository**: `CsvImportJobRepository` isolates Mongoose
- **Dynamic module**: `CsvImportModule.register()` — BullMQ when Redis up, noop otherwise
- **DI**: All services injectable; workers use `WorkerHost`
- **DTOs**: `class-validator` on presign/control endpoints

## Estimated throughput (M10 + t3.large)

| Rows | Batch 1000 | Approx time |
|------|------------|-------------|
| 1 lakh | 100 batches | 5–10 min |
| 10 lakh | 1000 batches | 30–50 min |
| 50 lakh | 5000 batches | 2.5–4 hrs |

Tune `CSV_IMPORT_BATCH_QUEUE_CONCURRENCY` and MongoDB pool size together — too much concurrency causes write contention on M10.
