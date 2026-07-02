#!/usr/bin/env bash
# Deploy backend on EC2 via SSH — run this FROM YOUR PC (Windows/Mac/Linux).
# Usage:
#   bash deploy/ec2/ssh-deploy-from-local.sh path/to/crm-key.pem
#   EC2_HOST=13.232.248.18 bash deploy/ec2/ssh-deploy-from-local.sh ~/crm-key.pem
set -euo pipefail

KEY="${1:-${CRM_KEY:-$HOME/.ssh/crm-key.pem}}"
HOST="${EC2_HOST:-13.232.248.18}"
USER="${EC2_USER:-ubuntu}"

if [ -z "${1:-}" ] && [ ! -f "$KEY" ]; then
  echo "Usage: bash deploy/ec2/ssh-deploy-from-local.sh [/path/to/crm-key.pem]"
  echo ""
  echo "Default key: ~/.ssh/crm-key.pem"
  echo ""
  echo "Example (Git Bash on Windows):"
  echo "  bash deploy/ec2/ssh-deploy-from-local.sh"
  echo "  bash deploy/ec2/ssh-deploy-from-local.sh /c/Users/YOU/.ssh/crm-key.pem"
  exit 1
fi

if [ ! -f "$KEY" ]; then
  echo "ERROR: SSH key not found: $KEY"
  exit 1
fi

chmod 600 "$KEY" 2>/dev/null || true

echo "==> Connecting to $USER@$HOST and running deploy..."
ssh -i "$KEY" \
  -o BatchMode=yes \
  -o ConnectTimeout=20 \
  -o StrictHostKeyChecking=accept-new \
  "$USER@$HOST" \
  'cd ~/quoreb2b-crm && git pull origin main && bash deploy/ec2/deploy-backend.sh'

echo ""
echo "Deploy finished on EC2."
