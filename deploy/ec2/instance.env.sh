#!/usr/bin/env bash
# EC2 public endpoint — update when instance IP changes.
export EC2_PUBLIC_IP="${EC2_PUBLIC_IP:-65.2.186.189}"
export EC2_SSLIP_HOST="${EC2_SSLIP_HOST:-65-2-186-189.sslip.io}"
export EC2_API_HTTPS_URL="https://${EC2_SSLIP_HOST}"
export EC2_API_HTTP_URL="http://${EC2_PUBLIC_IP}"
