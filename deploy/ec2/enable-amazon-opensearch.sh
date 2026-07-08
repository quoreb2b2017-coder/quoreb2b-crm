#!/usr/bin/env bash
# Wire Amazon OpenSearch domain to QuoreB2B API/Worker on EC2.
# Run ON EC2 after domain status = Active and endpoint is visible:
#
#   DOMAIN_ENDPOINT=https://vpc-crmsearch-xxxx.ap-south-1.es.amazonaws.com \
#   OPENSEARCH_USERNAME=admin \
#   OPENSEARCH_PASSWORD='***' \
#   bash deploy/ec2/enable-amazon-opensearch.sh
#
# Then: POST /api/v1/master-data/search-index/reindex (admin JWT)
set -euo pipefail

if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || -n "${MSYSTEM:-}" ]]; then
  echo "ERROR: Run this ON EC2, not on Windows."
  exit 1
fi

APP_DIR="${APP_DIR:-$HOME/quoreb2b-crm}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env.production}"
DOMAIN_ENDPOINT="${DOMAIN_ENDPOINT:-}"
OPENSEARCH_USERNAME="${OPENSEARCH_USERNAME:-}"
OPENSEARCH_PASSWORD="${OPENSEARCH_PASSWORD:-}"

if [ -z "$DOMAIN_ENDPOINT" ]; then
  echo "Usage:"
  echo "  DOMAIN_ENDPOINT=https://vpc-crmsearch-....es.amazonaws.com \\"
  echo "  OPENSEARCH_USERNAME=admin OPENSEARCH_PASSWORD='***' \\"
  echo "  bash deploy/ec2/enable-amazon-opensearch.sh"
  exit 1
fi

# normalize — strip trailing slash
DOMAIN_ENDPOINT="${DOMAIN_ENDPOINT%/}"

upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # escape sed replacement specials lightly
    local escaped
    escaped=$(printf '%s' "$val" | sed -e 's/[\/&]/g\\&')
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

echo "==> Updating $ENV_FILE"
upsert_env ELASTICSEARCH_ENABLED true
upsert_env ELASTICSEARCH_NODE "$DOMAIN_ENDPOINT"
if [ -n "$OPENSEARCH_USERNAME" ]; then
  upsert_env ELASTICSEARCH_USERNAME "$OPENSEARCH_USERNAME"
fi
if [ -n "$OPENSEARCH_PASSWORD" ]; then
  upsert_env ELASTICSEARCH_PASSWORD "$OPENSEARCH_PASSWORD"
fi
upsert_env ELASTICSEARCH_INDEX_PREFIX quoreb2b

grep -E '^ELASTICSEARCH_' "$ENV_FILE" | sed 's/PASSWORD=.*/PASSWORD=***/'

echo "==> Recreating API + worker with new env"
docker stop quoreb2b-api quoreb2b-worker 2>/dev/null || true
docker rm quoreb2b-api quoreb2b-worker 2>/dev/null || true

docker run -d --name quoreb2b-api --restart unless-stopped --network host \
  --env-file "$ENV_FILE" \
  -v /var/lib/quoreb2b/uploads:/app/uploads \
  -e BUILD_SHA="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)" \
  -e NODE_OPTIONS=--max-old-space-size=2048 \
  -e API_CLUSTER_WORKERS=1 \
  -e PROCESS_ROLE=api \
  -e SOCKET_REDIS_ADAPTER=false \
  quoreb2b-backend:latest

docker run -d --name quoreb2b-worker --restart unless-stopped --network host \
  --env-file "$ENV_FILE" \
  -v /var/lib/quoreb2b/uploads:/app/uploads \
  -e PORT=4001 \
  -e PROCESS_ROLE=worker \
  -e API_CLUSTER_WORKERS=1 \
  -e NODE_OPTIONS=--max-old-space-size=2048 \
  -e SOCKET_REDIS_ADAPTER=false \
  quoreb2b-backend:latest

for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:4000/api/v1/health >/dev/null; then
    echo "API healthy"
    curl -sf http://127.0.0.1:4000/api/v1/health | python3 -m json.tool 2>/dev/null | head -40 || true
    echo ""
    echo "Next: call POST /api/v1/master-data/search-index/reindex with admin JWT"
    echo "to sync Mongo master-data → OpenSearch index quoreb2b_master_data"
    exit 0
  fi
  sleep 2
done

echo "API failed to become healthy"
docker logs quoreb2b-api 2>&1 | tail -40
exit 1
