#!/usr/bin/env bash
# Obtain / renew Let's Encrypt cert for the sslip.io hostname (new EC2 public IP).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=instance.env.sh
source "$SCRIPT_DIR/instance.env.sh"

DOMAIN="${EC2_SSLIP_HOST}"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [ -f "${CERT_DIR}/fullchain.pem" ]; then
  echo "==> SSL cert already exists for ${DOMAIN}"
  sudo certbot renew --quiet 2>/dev/null || true
  exit 0
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "==> Installing certbot..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx
fi

echo "==> Requesting SSL certificate for ${DOMAIN} (IP ${EC2_PUBLIC_IP})..."
sudo certbot --nginx \
  -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --redirect

echo "==> SSL ready for https://${DOMAIN}"
