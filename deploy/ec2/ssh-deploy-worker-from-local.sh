#!/usr/bin/env bash
# Deploy BullMQ worker container on EC2 via SSH — run FROM YOUR PC (Windows/Mac/Linux).
# Usage:
#   bash deploy/ec2/ssh-deploy-worker-from-local.sh
#   bash deploy/ec2/ssh-deploy-worker-from-local.sh /c/Users/YOU/.ssh/crm-key.pem
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=instance.env.sh
source "$SCRIPT_DIR/instance.env.sh"

KEY="${1:-${CRM_KEY:-$HOME/.ssh/crm-key.pem}}"
HOST="${EC2_HOST:-$EC2_PUBLIC_IP}"
USER="${EC2_USER:-ubuntu}"

if [ ! -f "$KEY" ]; then
  echo "ERROR: SSH key not found: $KEY"
  echo ""
  echo "Usage: bash deploy/ec2/ssh-deploy-worker-from-local.sh [/path/to/crm-key.pem]"
  echo ""
  echo "Examples (Git Bash on Windows):"
  echo "  bash deploy/ec2/ssh-deploy-worker-from-local.sh /c/Users/gafru/Downloads/crm-key.pem"
  echo "  CRM_KEY=/c/Users/gafru/.ssh/crm-key.pem bash deploy/ec2/ssh-deploy-worker-from-local.sh"
  echo ""
  echo "EC2 host: $USER@$HOST"
  exit 1
fi

chmod 600 "$KEY" 2>/dev/null || true

echo "==> Connecting to $USER@$HOST and deploying worker..."
ssh -i "$KEY" \
  -o BatchMode=yes \
  -o ConnectTimeout=20 \
  -o StrictHostKeyChecking=accept-new \
  "$USER@$HOST" \
  'cd ~/quoreb2b-crm && git fetch origin main && git clean -fd && git reset --hard origin/main && bash deploy/ec2/ensure-production-env.sh && bash deploy/ec2/deploy-worker.sh'

echo ""
echo "Worker deploy finished on EC2."
