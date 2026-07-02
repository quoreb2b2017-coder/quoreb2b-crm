#!/usr/bin/env bash
# Build and run QuoreB2B backend on EC2 (also triggered by GitHub Actions on push to main).
# Run ON EC2 ONLY: bash deploy/ec2/deploy-backend.sh
# From your PC use: bash deploy/ec2/ssh-deploy-from-local.sh path/to/crm-key.pem
set -euo pipefail

if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || -n "${MSYSTEM:-}" ]]; then
  echo ""
  echo "ERROR: This script must run ON THE EC2 SERVER, not on Windows/Git Bash."
  echo ""
  echo "From your PC, run ONE of these instead:"
  echo "  bash deploy/ec2/ssh-deploy-from-local.sh /path/to/crm-key.pem"
  echo "  ssh -i crm-key.pem ubuntu@13.232.248.18 'bash ~/quoreb2b-crm/deploy/ec2/deploy-backend.sh'"
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
CONTAINER_NAME="${CONTAINER_NAME:-quoreb2b-api}"

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy from backend/.env.production.example and fill values."
  exit 1
fi

echo "==> Pulling latest code (discard any local edits on server)..."
git fetch origin main
git clean -fd
git reset --hard origin/main

echo "==> Ensuring Redis is running..."
bash "$APP_DIR/deploy/ec2/ensure-redis.sh"

echo "==> Ensuring production env..."
bash "$APP_DIR/deploy/ec2/ensure-production-env.sh"

echo "==> Updating Nginx (large upload timeouts)..."
sudo cp "$APP_DIR/deploy/ec2/nginx-quoreb2b-api.conf" /etc/nginx/sites-available/quoreb2b-api
sudo ln -sf /etc/nginx/sites-available/quoreb2b-api /etc/nginx/sites-enabled/quoreb2b-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

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
  -e "BUILD_SHA=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)" \
  -e "NODE_OPTIONS=--max-old-space-size=1536" \
  "$IMAGE_NAME"

echo "==> Waiting for API..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4000/api/v1/health >/dev/null; then
    echo ""
    curl -sf http://127.0.0.1:4000/api/v1/health | python3 -m json.tool 2>/dev/null || curl -sf http://127.0.0.1:4000/api/v1/health
    echo ""
    echo "Deploy done. Logs: docker logs -f $CONTAINER_NAME"
    exit 0
  fi
  sleep 2
done
echo "Health check failed — recent logs:"
docker logs "$CONTAINER_NAME" 2>&1 | tail -30
exit 1
