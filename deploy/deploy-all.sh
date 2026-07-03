#!/usr/bin/env bash
# Deploy QuoreB2B CRM — backend (EC2) + frontend (Vercel).
#
# Usage:
#   bash deploy/deploy-all.sh                          # backend only (default key)
#   bash deploy/deploy-all.sh /path/to/crm-key.pem     # backend with SSH key
#   bash deploy/deploy-all.sh --frontend-only          # Vercel frontend only
#   bash deploy/deploy-all.sh --all /path/to/key.pem   # both
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ec2/instance.env.sh
source "$ROOT/deploy/ec2/instance.env.sh"
KEY="${CRM_KEY:-$HOME/.ssh/crm-key.pem}"
DEPLOY_BACKEND=true
DEPLOY_FRONTEND=false

for arg in "$@"; do
  case "$arg" in
    --frontend-only)
      DEPLOY_BACKEND=false
      DEPLOY_FRONTEND=true
      ;;
    --all)
      DEPLOY_FRONTEND=true
      ;;
    --help|-h)
      echo "Usage: bash deploy/deploy-all.sh [--all] [--frontend-only] [ssh-key.pem]"
      exit 0
      ;;
    *)
      if [ -f "$arg" ]; then
        KEY="$arg"
      fi
      ;;
  esac
done

echo "=============================================="
echo " QuoreB2B CRM Deploy"
echo "=============================================="

if $DEPLOY_BACKEND; then
  echo ""
  echo "==> [1/2] Backend (EC2)..."
  bash "$ROOT/deploy/ec2/ssh-deploy-from-local.sh" "$KEY"
  echo ""
  echo "==> Backend health check..."
  if curl -sf --max-time 20 "${EC2_API_HTTPS_URL}/api/v1/health" | grep -q '"status":"ok"'; then
    SHA=$(curl -sf --max-time 20 "${EC2_API_HTTPS_URL}/api/v1/health" | grep -o '"buildSha":"[^"]*"' | head -1)
    echo "    OK — API healthy ($SHA)"
  elif curl -sf --max-time 20 "${EC2_API_HTTP_URL}/api/v1/health" | grep -q '"status":"ok"'; then
    SHA=$(curl -sf --max-time 20 "${EC2_API_HTTP_URL}/api/v1/health" | grep -o '"buildSha":"[^"]*"' | head -1)
    echo "    OK — API healthy on HTTP ($SHA) — run ensure-ssl.sh on EC2 for HTTPS"
  else
    echo "    WARNING: health check failed — run: ssh ubuntu@${EC2_PUBLIC_IP} 'docker logs quoreb2b-api'"
    exit 1
  fi
fi

if $DEPLOY_FRONTEND; then
  echo ""
  echo "==> [2/2] Frontend (Vercel)..."
  if ! command -v npx >/dev/null 2>&1; then
    echo "ERROR: npx not found"
    exit 1
  fi
  cd "$ROOT/frontend/crm-frontend"
  if npx vercel --prod --yes; then
    echo "    OK — Vercel production deploy complete"
  else
    echo ""
    echo "Vercel CLI failed (token missing?). Do ONE of these:"
    echo "  1. Run:  cd frontend/crm-frontend && npx vercel login && npx vercel --prod"
    echo "  2. Or:   https://vercel.com → your project → Deployments → Redeploy (main branch)"
  fi
fi

echo ""
echo "=============================================="
echo " Done"
echo "  API:      ${EC2_API_HTTPS_URL}/api/v1/health"
echo "  Frontend: https://crm.quoreb2b.com"
echo "=============================================="
