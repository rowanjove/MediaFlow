# One-click local preview for MediaFlow (Windows)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$env:CI = 'true'
$env:WRANGLER_SEND_METRICS = 'false'
$env:NO_PROXY = '127.0.0.1,localhost'
$env:no_proxy = '127.0.0.1,localhost'

function Write-Step([string]$msg) {
  Write-Host $msg
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: Node.js not found. Install Node.js 18+ and reopen this script.'
  Read-Host 'Press Enter to exit'
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  Write-Step 'Installing npm dependencies...'
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: npm install failed.'
    Read-Host 'Press Enter to exit'
    exit 1
  }
}

Write-Step 'Building frontend...'
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host 'ERROR: npm run build failed.'
  Read-Host 'Press Enter to exit'
  exit 1
}

function Test-PortOpen([int]$p) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('127.0.0.1', $p)
    $tcp.Close()
    return $true
  } catch {
    return $false
  }
}

$port = 8787
if (Test-PortOpen $port) { $port = 8788 }

$url = "http://127.0.0.1:$port/"
Write-Host ""
Write-Host "Starting local server: $url"
Write-Host "Close this window to stop."
Write-Host ""

$opener = @"
Start-Sleep -Seconds 4
for (`$i = 0; `$i -lt 30; `$i++) {
  try {
    `$tcp = New-Object System.Net.Sockets.TcpClient
    `$tcp.Connect('127.0.0.1', $port)
    `$tcp.Close()
    Start-Process '$url'
    exit 0
  } catch {}
  Start-Sleep -Milliseconds 400
}
"@
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command', $opener
)

npx --yes wrangler dev --ip 127.0.0.1 --port $port
if ($LASTEXITCODE -ne 0) {
  Write-Host 'ERROR: wrangler failed to start.'
  Read-Host 'Press Enter to exit'
  exit 1
}
