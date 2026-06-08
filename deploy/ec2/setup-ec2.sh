#!/usr/bin/env bash
# One-time EC2 setup for QuoreB2B backend (Ubuntu 24.04)
# Run on EC2: bash deploy/ec2/setup-ec2.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/quoreb2b2017-coder/quoreb2b-crm.git}"
APP_DIR="${APP_DIR:-$HOME/quoreb2b-crm}"

echo "==> Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y git curl nginx certbot python3-certbot-nginx

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

echo "==> Cloning repository..."
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "Repo already exists at $APP_DIR — skipping clone"
fi

cd "$APP_DIR"

if [ ! -f backend/.env.production ]; then
  cp backend/.env.production.example backend/.env.production
  echo ""
  echo "!! Created backend/.env.production from example."
  echo "!! EDIT IT NOW: nano $APP_DIR/backend/.env.production"
  echo "!! Set MONGODB_URI, JWT secrets, REDIS_PASSWORD, CORS_ORIGINS"
fi

echo "==> Installing Nginx site..."
sudo cp deploy/ec2/nginx-quoreb2b-api.conf /etc/nginx/sites-available/quoreb2b-api
sudo ln -sf /etc/nginx/sites-available/quoreb2b-api /etc/nginx/sites-enabled/quoreb2b-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

chmod +x deploy/ec2/deploy-backend.sh

echo ""
echo "Setup complete. Next steps:"
echo "  1. Edit: nano $APP_DIR/backend/.env.production"
echo "  2. MongoDB Atlas: whitelist this EC2 public IP"
echo "  3. Deploy:  bash $APP_DIR/deploy/ec2/deploy-backend.sh"
echo "  4. SSL:     sudo certbot --nginx -d api.quoreb2b.com  (after DNS A record)"
echo "  5. Health:  curl http://127.0.0.1:4000/api/v1/health"
