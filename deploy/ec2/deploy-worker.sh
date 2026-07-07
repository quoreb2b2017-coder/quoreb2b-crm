#!/usr/bin/env bash
# Run BullMQ workers only (CSV import, bulk email) — scale horizontally separate from API.
# Run ON EC2 ONLY: bash deploy/ec2/deploy-worker.sh
# From your PC use: bash deploy/ec2/ssh-deploy-worker-from-local.sh [/path/to/crm-key.pem]
set -euo pipefail

if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || -n "${MSYSTEM:-}" ]]; then
  echo ""
  echo "ERROR: This script must run ON THE EC2 SERVER, not on Windows/Git Bash."
  echo ""
  echo "From your PC, run ONE of these instead:"
  echo "  bash deploy/ec2/ssh-deploy-worker-from-local.sh"
  echo "  bash deploy/ec2/ssh-deploy-worker-from-local.sh /c/Users/YOU/.ssh/crm-key.pem"
  echo "  ssh -i crm-key.pem ubuntu@65.2.186.189 'bash ~/quoreb2b-crm/deploy/ec2/deploy-worker.sh'"
  echo ""
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo ""
  echo "ERROR: docker not found on this machine."
  echo "If this is EC2, run once: bash ~/quoreb2b-crm/deploy/ec2/setup-ec2.sh"
  echo "Then log out/in (or: newgrp docker) and run this script again."
  echo ""
  exit 1
fi

APP_DIR="${APP_DIR:-$HOME/quoreb2b-crm}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env.production}"
IMAGE_NAME="${IMAGE_NAME:-quoreb2b-backend:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-quoreb2b-worker}"

# shellcheck source=instance.env.sh
source "$APP_DIR/deploy/ec2/instance.env.sh" 2>/dev/null || true

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy from backend/.env.production.example and fill values."
  exit 1
fi

echo "==> Ensuring Redis is running..."
bash "$APP_DIR/deploy/ec2/ensure-redis.sh"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "==> Image $IMAGE_NAME not found — building (same image as API)..."
  cd "$APP_DIR/backend"
  docker build -t "$IMAGE_NAME" .
  cd "$APP_DIR"
fi

echo "==> Ensuring upload directory on host..."
sudo mkdir -p /var/lib/quoreb2b/uploads/master-data-imports
sudo chown -R 1000:1000 /var/lib/quoreb2b/uploads 2>/dev/null || true

docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  -v /var/lib/quoreb2b/uploads:/app/uploads \
  -e "PORT=4001" \
  -e "PROCESS_ROLE=worker" \
  -e "API_CLUSTER_WORKERS=1" \
  -e "NODE_OPTIONS=--max-old-space-size=4096" \
  -e "CSV_IMPORT_QUEUE_CONCURRENCY=${CSV_IMPORT_QUEUE_CONCURRENCY:-4}" \
  -e "CSV_IMPORT_BATCH_QUEUE_CONCURRENCY=${CSV_IMPORT_BATCH_QUEUE_CONCURRENCY:-8}" \
  -e "BULK_EMAIL_QUEUE_CONCURRENCY=${BULK_EMAIL_QUEUE_CONCURRENCY:-12}" \
  "$IMAGE_NAME"

echo ""
echo "Worker container started: $CONTAINER_NAME (port 4001, PROCESS_ROLE=worker)"
echo "Logs: docker logs -f $CONTAINER_NAME"
echo "Health: curl -sf http://127.0.0.1:4001/api/v1/health"
