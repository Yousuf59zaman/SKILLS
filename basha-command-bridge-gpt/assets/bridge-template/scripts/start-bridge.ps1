param(
    [switch]$Detached,
    [string]$HostName,
    [int]$Port
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SetupScript = Join-Path $PSScriptRoot "setup.ps1"
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$PidPath = Join-Path $ProjectRoot ".bridge.pid"
$LogDir = Join-Path $ProjectRoot "logs"

function Get-EnvValue {
    param([string]$Name, [string]$Default)
    $envFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $envFile) {
        $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
        if ($line) {
            return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
        }
    }
    return $Default
}

if (-not (Test-Path $VenvPython)) {
    & $SetupScript
}

if (-not $HostName) {
    $HostName = Get-EnvValue -Name "BRIDGE_HOST" -Default "127.0.0.1"
}
if (-not $Port) {
    $Port = [int](Get-EnvValue -Name "BRIDGE_PORT" -Default "8765")
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$Args = @("-m", "uvicorn", "bridge.server:app", "--host", $HostName, "--port", $Port.ToString())

if ($Detached) {
    $stdout = Join-Path $LogDir "server.out.log"
    $stderr = Join-Path $LogDir "server.err.log"
    $process = Start-Process -FilePath $VenvPython -ArgumentList $Args -WorkingDirectory $ProjectRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath $PidPath -Value $process.Id -Encoding ASCII
    Write-Host "Bridge started in background on http://$HostName`:$Port"
    Write-Host "PID: $($process.Id)"
    Write-Host "Logs: $stdout and $stderr"
    exit 0
}

Set-Location $ProjectRoot
Write-Host "Bridge starting on http://$HostName`:$Port"
& $VenvPython @Args
