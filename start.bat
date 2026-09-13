@echo off
setlocal
cd /d "%~dp0"

set CI=true
set WRANGLER_SEND_METRICS=false
set NO_PROXY=127.0.0.1,localhost
set no_proxy=127.0.0.1,localhost

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Install Node.js 18+ first.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
  echo.
  echo Start failed. See messages above.
  pause
  exit /b 1
)
