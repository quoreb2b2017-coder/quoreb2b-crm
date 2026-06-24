#!/usr/bin/env bash
# Start Redis on EC2 (host network — API uses REDIS_HOST=127.0.0.1 from .env.production).
# Sourced by deploy-backend.sh or run standalone: bash deploy/ec2/ensure-redis.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/quoreb2b-crm}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env.production}"
REDIS_CONTAINER="${REDIS_CONTAINER:-quoreb2b-redis}"
REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"
REDIS_VOLUME="${REDIS_VOLUME:-quoreb2b_redis_data}"

read_env_var() {
  local key="$1"
  local file="$2"
  if [ ! -f "$file" ]; then
    echo ""
    return 0
  fi
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | sed 's/^"//;s/"$//' \
    | sed "s/^'//;s/'$//"
}

redis_cli_ping() {
  local password="${1:-}"
  if [ -n "$password" ]; then
    docker exec "$REDIS_CONTAINER" redis-cli -a "$password" --no-auth-warning ping 2>/dev/null
  else
    docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null
  fi
}

REDIS_PASSWORD="$(read_env_var REDIS_PASSWORD "$ENV_FILE")"
REDIS_PORT="$(read_env_var REDIS_PORT "$ENV_FILE")"
REDIS_PORT="${REDIS_PORT:-6379}"

redis_responds() {
  docker ps --format '{{.Names}}' | grep -qx "$REDIS_CONTAINER" \
    && [ "$(redis_cli_ping "$REDIS_PASSWORD")" = "PONG" ]
}

start_redis_container() {
  local -a cmd=(redis-server --appendonly yes --port "$REDIS_PORT")
  if [ -n "$REDIS_PASSWORD" ]; then
    cmd+=(--requirepass "$REDIS_PASSWORD")
  fi

  echo "==> Starting Redis ($REDIS_IMAGE on 127.0.0.1:$REDIS_PORT)..."
  docker stop "$REDIS_CONTAINER" 2>/dev/null || true
  docker rm "$REDIS_CONTAINER" 2>/dev/null || true
  docker run -d \
    --name "$REDIS_CONTAINER" \
    --restart unless-stopped \
    --network host \
    -v "${REDIS_VOLUME}:/data" \
    "$REDIS_IMAGE" \
    "${cmd[@]}"
}

if redis_responds; then
  echo "==> Redis already running ($REDIS_CONTAINER)"
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$REDIS_CONTAINER"; then
  echo "==> Redis container exists but not responding — recreating..."
fi

start_redis_container

echo "==> Waiting for Redis..."
for _ in $(seq 1 20); do
  if [ "$(redis_cli_ping "$REDIS_PASSWORD")" = "PONG" ]; then
    echo "==> Redis OK (PONG)"
    exit 0
  fi
  sleep 1
done

echo "ERROR: Redis did not respond to ping. Check: docker logs $REDIS_CONTAINER"
exit 1
