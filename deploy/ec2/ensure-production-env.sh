#!/usr/bin/env bash
# Ensure backend/.env.production exists and has required production toggles.
# Preserves existing secrets (MongoDB, JWT, Redis). Run on EC2 before deploy.
set -euo pipefail

if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || -n "${MSYSTEM:-}" ]]; then
  echo ""
  echo "ERROR: Run this on the EC2 SERVER (AWS Instance Connect), not Windows/Git Bash."
  echo ""
  echo "AWS Console → EC2 → Connect → EC2 Instance Connect, then run:"
  echo "  cd ~/quoreb2b-crm && git pull origin main && bash deploy/ec2/ensure-production-env.sh && bash deploy/ec2/deploy-backend.sh"
  echo ""
  exit 1
fi

APP_DIR="${APP_DIR:-$HOME/quoreb2b-crm}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env.production}"
EXAMPLE_FILE="$APP_DIR/backend/.env.production.example"
CONTAINER_NAME="${CONTAINER_NAME:-quoreb2b-api}"

set_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

ensure_cors_origin() {
  local key="$1"
  local origin="$2"
  local file="$3"
  local current=""
  current="$(grep "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true)"
  if [ -z "$current" ]; then
    set_env_var "$key" "$origin" "$file"
    return 0
  fi
  case ",${current}," in
    *,"${origin}",*) ;;
    *) set_env_var "$key" "${current},${origin}" "$file" ;;
  esac
}

restore_from_container() {
  if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    return 1
  fi
  echo "==> Restoring $ENV_FILE from running container $CONTAINER_NAME..."
  docker inspect "$CONTAINER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(NODE_ENV|PORT|API_|APP_|CORS_|SOCKET_|MONGODB_|REDIS_|JWT_|THROTTLE_|SENTRY_|LOG_|BULLMQ_|ELASTICSEARCH_|BULK_|LOGIN_|SUPER_ADMIN_|RESEND_)=' \
    | sort -u > "$ENV_FILE"
}

needs_bootstrap() {
  [ ! -f "$ENV_FILE" ] && return 0
  [ ! -s "$ENV_FILE" ] && return 0
  ! grep -q '^MONGODB_URI=.\+' "$ENV_FILE" 2>/dev/null
}

if needs_bootstrap; then
  if restore_from_container; then
    echo "==> Restored env from Docker container."
  elif [ -f "$EXAMPLE_FILE" ]; then
    echo "==> Copying $EXAMPLE_FILE → $ENV_FILE (fill secrets before deploy if health fails)."
    cp "$EXAMPLE_FILE" "$ENV_FILE"
  else
    echo "ERROR: Missing $ENV_FILE and no $EXAMPLE_FILE to copy."
    exit 1
  fi
fi

if grep -q '^MONGODB_URI=.*CHANGE_ME\|^MONGODB_URI=.*USER:PASSWORD' "$ENV_FILE" 2>/dev/null; then
  echo "WARNING: MONGODB_URI still has placeholder — set real Atlas URI in $ENV_FILE"
fi

echo "==> Applying production toggles..."
set_env_var NODE_ENV production "$ENV_FILE"
set_env_var LOGIN_ALLOWED_IPS "${LOGIN_ALLOWED_IPS:-125.18.195.150}" "$ENV_FILE"
set_env_var BULK_EMAIL_SKIP_SMTP_PROBE "${BULK_EMAIL_SKIP_SMTP_PROBE:-true}" "$ENV_FILE"
set_env_var BULK_EMAIL_MX_ONLY_FALLBACK "${BULK_EMAIL_MX_ONLY_FALLBACK:-true}" "$ENV_FILE"
set_env_var BULK_EMAIL_SKIP_CATCH_ALL_PROBE "${BULK_EMAIL_SKIP_CATCH_ALL_PROBE:-true}" "$ENV_FILE"
set_env_var SUPER_ADMIN_LOGIN_EMAILS "${SUPER_ADMIN_LOGIN_EMAILS:-quoreb2b2017@gmail.com}" "$ENV_FILE"

REQUIRED_CORS_ORIGINS=(
  "https://crm.quoreb2b.com"
  "https://13-232-248-18.sslip.io"
  "http://localhost:3000"
)
for origin in "${REQUIRED_CORS_ORIGINS[@]}"; do
  ensure_cors_origin CORS_ORIGINS "$origin" "$ENV_FILE"
  ensure_cors_origin SOCKET_CORS_ORIGINS "$origin" "$ENV_FILE"
done

echo "==> Env ready: LOGIN_ALLOWED_IPS=$(grep '^LOGIN_ALLOWED_IPS=' "$ENV_FILE" | cut -d= -f2-)"
echo "==> CORS_ORIGINS=$(grep '^CORS_ORIGINS=' "$ENV_FILE" | cut -d= -f2-)"
