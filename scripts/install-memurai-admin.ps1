#Requires -RunAsAdministrator
# Installs Memurai Developer (Redis 6+) for BullMQ. Run: right-click -> Run with PowerShell (Admin)

$ErrorActionPreference = 'Stop'

Write-Host 'Stopping old Redis 3.x if present...' -ForegroundColor Cyan
Stop-Service Redis -Force -ErrorAction SilentlyContinue
Set-Service Redis -StartupType Disabled -ErrorAction SilentlyContinue
Stop-Process -Name redis-server -Force -ErrorAction SilentlyContinue

Write-Host 'Installing Memurai Developer (Redis 6 compatible)...' -ForegroundColor Cyan
winget install Memurai.MemuraiDeveloper -e --accept-source-agreements --accept-package-agreements

$cli = 'C:\Program Files\Memurai\memurai-cli.exe'
if (-not (Test-Path $cli)) {
  Write-Host 'Memurai CLI not found. Install may have failed.' -ForegroundColor Red
  exit 1
}

Start-Service Memurai -ErrorAction SilentlyContinue
Start-Sleep 2

Write-Host 'Ping:' -ForegroundColor Cyan
& $cli ping
Write-Host 'Version:' -ForegroundColor Cyan
& $cli INFO server | Select-String 'redis_version'

Write-Host ''
Write-Host 'Done. Restart backend with REDIS_ENABLED=true in backend/.env' -ForegroundColor Green
