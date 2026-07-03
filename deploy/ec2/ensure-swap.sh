#!/usr/bin/env bash
# Ensure swap exists so large imports do not freeze the EC2 instance (OOM).
set -euo pipefail

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"

if swapon --show | grep -q "${SWAP_FILE}"; then
  echo "==> Swap already active: ${SWAP_FILE}"
  swapon --show
  exit 0
fi

if [ -f "${SWAP_FILE}" ]; then
  echo "==> Enabling existing swap file ${SWAP_FILE}"
  sudo swapon "${SWAP_FILE}" || true
  if swapon --show | grep -q "${SWAP_FILE}"; then
    swapon --show
    exit 0
  fi
fi

echo "==> Creating ${SWAP_SIZE_GB}G swap at ${SWAP_FILE} (one-time, prevents OOM during large uploads)..."
sudo fallocate -l "${SWAP_SIZE_GB}G" "${SWAP_FILE}" 2>/dev/null || \
  sudo dd if=/dev/zero of="${SWAP_FILE}" bs=1M count=$((SWAP_SIZE_GB * 1024)) status=progress
sudo chmod 600 "${SWAP_FILE}"
sudo mkswap "${SWAP_FILE}"
sudo swapon "${SWAP_FILE}"
echo "==> Swap enabled:"
swapon --show
free -h
