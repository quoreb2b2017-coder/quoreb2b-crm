#!/usr/bin/env bash
# Build and run QuoreB2B backend on EC2 (also triggered by GitHub Actions on push to main).
# Run: bash deploy/ec2/deploy-backend.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/quoreb2b-crm}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env.production}"
IMAGE_NAME="${IMAGE_NAME:-quoreb2b-backend:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-quoreb2b-api}"

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy from backend/.env.production.example and fill values."
  exit 1
fi

echo "==> Pulling latest code..."
git pull origin main

echo "==> Building Docker image..."
cd backend
docker build -t "$IMAGE_NAME" .

echo "==> Restarting container..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  "$IMAGE_NAME"

echo "==> Waiting for API..."
sleep 8
curl -sf http://127.0.0.1:4000/api/v1/health | head -c 500 || {
  echo "Health check failed — recent logs:"
  docker logs "$CONTAINER_NAME" 2>&1 | tail -20
  exit 1
}
echo ""
echo "Deploy done. Logs: docker logs -f $CONTAINER_NAME"
