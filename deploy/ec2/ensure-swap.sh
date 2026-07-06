#!/usr/bin/env bash
# Ensure swap exists so large imports do not freeze the EC2 instance (OOM).
set -euo pipefail

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
# Leave at least this much free on root after creating swap (Docker builds need headroom).
MIN_FREE_AFTER_SWAP_GB="${MIN_FREE_AFTER_SWAP_GB:-1}"

if swapon --show | grep -q "${SWAP_FILE}"; then
  echo "==> Swap already active: ${SWAP_FILE}"
  swapon --show
  exit 0
fi

if [ -f "${SWAP_FILE}" ]; then
  echo "==> Enabling existing swap file ${SWAP_FILE}"
  if sudo swapon "${SWAP_FILE}" 2>/dev/null && swapon --show | grep -q "${SWAP_FILE}"; then
    swapon --show
    exit 0
  fi
  echo "==> Removing broken/partial swap file ${SWAP_FILE}"
  sudo swapoff "${SWAP_FILE}" 2>/dev/null || true
  sudo rm -f "${SWAP_FILE}"
fi

AVAIL_KB=$(df --output=avail / | tail -1 | tr -d ' ')
AVAIL_GB=$((AVAIL_KB / 1024 / 1024))
MAX_SWAP_GB=$((AVAIL_GB - MIN_FREE_AFTER_SWAP_GB))
if [ "$MAX_SWAP_GB" -lt 1 ]; then
  echo "==> Skipping swap — only ${AVAIL_GB}GB free (need ${MIN_FREE_AFTER_SWAP_GB}GB+ for Docker builds)"
  exit 0
fi

if [ "$SWAP_SIZE_GB" -gt "$MAX_SWAP_GB" ]; then
  echo "==> Capping swap ${SWAP_SIZE_GB}G → ${MAX_SWAP_GB}G (disk has ${AVAIL_GB}GB free)"
  SWAP_SIZE_GB=$MAX_SWAP_GB
fi

echo "==> Creating ${SWAP_SIZE_GB}G swap at ${SWAP_FILE}..."
sudo fallocate -l "${SWAP_SIZE_GB}G" "${SWAP_FILE}" 2>/dev/null || \
  sudo dd if=/dev/zero of="${SWAP_FILE}" bs=1M count=$((SWAP_SIZE_GB * 1024)) status=none
sudo chmod 600 "${SWAP_FILE}"
sudo mkswap "${SWAP_FILE}"
sudo swapon "${SWAP_FILE}"
echo "==> Swap enabled:"
swapon --show
free -h
