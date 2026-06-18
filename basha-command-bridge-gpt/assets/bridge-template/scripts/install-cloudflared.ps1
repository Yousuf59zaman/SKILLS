$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ToolDir = Join-Path $ProjectRoot "tools\cloudflared"
$LocalExe = Join-Path $ToolDir "cloudflared.exe"

if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    cloudflared --version
    Write-Host "cloudflared is already available on PATH."
    exit 0
}

New-Item -ItemType Directory -Path $ToolDir -Force | Out-Null
$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
Write-Host "Downloading cloudflared from $url"
Invoke-WebRequest -Uri $url -OutFile $LocalExe
& $LocalExe --version
Write-Host "Downloaded local cloudflared: $LocalExe"
Write-Host "Use scripts\start-tunnel.ps1 with -CloudflaredPath `"$LocalExe`" if cloudflared is not on PATH."
