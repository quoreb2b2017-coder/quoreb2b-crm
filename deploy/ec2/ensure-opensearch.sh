#!/usr/bin/env bash
# Start OpenSearch-compatible Elasticsearch on EC2 for master-data search (<500ms).
# Run ON EC2: bash deploy/ec2/ensure-opensearch.sh
set -euo pipefail

CONTAINER_NAME="${OPENSEARCH_CONTAINER:-quoreb2b-opensearch}"
IMAGE="${OPENSEARCH_IMAGE:-docker.elastic.co/elasticsearch/elasticsearch:8.15.0}"
PORT="${OPENSEARCH_PORT:-9200}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found"
  exit 1
fi

# ES/OpenSearch requirement on Linux
if [ "$(sysctl -n vm.max_map_count 2>/dev/null || echo 0)" -lt 262144 ]; then
  echo "==> Setting vm.max_map_count=262144"
  sudo sysctl -w vm.max_map_count=262144 >/dev/null
  echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-quoreb2b-opensearch.conf >/dev/null
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  if curl -sf "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
    echo "==> OpenSearch already running on 127.0.0.1:${PORT}"
    exit 0
  fi
  echo "==> Container up but not healthy — restarting..."
  docker restart "$CONTAINER_NAME"
else
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  echo "==> Starting OpenSearch-compatible ES (${IMAGE}) on ${PORT}..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --network host \
    -e discovery.type=single-node \
    -e xpack.security.enabled=false \
    -e xpack.security.http.ssl.enabled=false \
    -e ES_JAVA_OPTS='-Xms1g -Xmx1g' \
    -e cluster.name=quoreb2b-search \
    -e bootstrap.memory_lock=true \
    --ulimit memlock=-1:-1 \
    -v quoreb2b_opensearch_data:/usr/share/elasticsearch/data \
    "$IMAGE"
fi

echo "==> Waiting for OpenSearch on :${PORT}..."
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
    echo "OpenSearch ready: http://127.0.0.1:${PORT}"
    curl -sf "http://127.0.0.1:${PORT}" | head -c 200
    echo ""
    exit 0
  fi
  sleep 2
done

echo "OpenSearch failed to become ready"
docker logs "$CONTAINER_NAME" 2>&1 | tail -40
exit 1
