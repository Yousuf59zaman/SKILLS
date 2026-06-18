param(
    [switch]$Quick,
    [switch]$Detached,
    [string]$Token,
    [string]$Hostname,
    [string]$CloudflaredPath = "cloudflared",
    [int]$LocalPort = 8765
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

if ($CloudflaredPath -eq "cloudflared" -and -not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    $localExe = Join-Path $ProjectRoot "tools\cloudflared\cloudflared.exe"
    if (Test-Path $localExe) {
        $CloudflaredPath = $localExe
    }
}

if (-not $Token -and -not $Hostname) {
    $Quick = $true
}

if ($Quick) {
    $target = "http://127.0.0.1:$LocalPort"
    $args = @("tunnel", "--url", $target, "--no-autoupdate")
    if ($Detached) {
        $stdout = Join-Path $LogDir "tunnel.out.log"
        $stderr = Join-Path $LogDir "tunnel.err.log"
        $pidPath = Join-Path $ProjectRoot ".tunnel.pid"
        $urlPath = Join-Path $ProjectRoot ".tunnel-url"
        $process = Start-Process -FilePath $CloudflaredPath -ArgumentList $args -WorkingDirectory $ProjectRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
        Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII
        Write-Host "Quick Cloudflare tunnel starting for $target"
        Write-Host "PID: $($process.Id)"
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Milliseconds 500
            $combined = ""
            if (Test-Path $stdout) { $combined += Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue }
            if (Test-Path $stderr) { $combined += Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue }
            $match = [regex]::Match($combined, "https://[-a-zA-Z0-9.]+\.trycloudflare\.com")
            if ($match.Success) {
                Set-Content -LiteralPath $urlPath -Value $match.Value -Encoding ASCII
                Write-Host "Tunnel URL: $($match.Value)"
                Write-Host "OpenAPI URL: $($match.Value)/openapi.json"
                exit 0
            }
            if ($process.HasExited) {
                throw "cloudflared exited before a tunnel URL was found. Check $stderr"
            }
        }
        throw "Timed out waiting for tunnel URL. Check $stderr"
    }
    Write-Host "Starting quick Cloudflare tunnel for $target"
    & $CloudflaredPath @args
    exit $LASTEXITCODE
}

if ($Token) {
    Write-Host "Starting Cloudflare Tunnel from token."
    & $CloudflaredPath tunnel run --token $Token
    exit $LASTEXITCODE
}

if ($Hostname) {
    Write-Host "Starting named Cloudflare Tunnel route for https://$Hostname -> http://127.0.0.1:$LocalPort"
    Write-Host "This assumes cloudflared is already logged in and the named tunnel/route exists."
    & $CloudflaredPath tunnel --url "http://127.0.0.1:$LocalPort" --hostname $Hostname
    exit $LASTEXITCODE
}

throw "Provide either -Token from Cloudflare Zero Trust or -Hostname for an existing named tunnel."
