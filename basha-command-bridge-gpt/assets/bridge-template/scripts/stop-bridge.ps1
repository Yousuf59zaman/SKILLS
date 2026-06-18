$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidPath = Join-Path $ProjectRoot ".bridge.pid"
$stopped = $false

if (Test-Path $PidPath) {
    $pidValue = (Get-Content -LiteralPath $PidPath -Raw).Trim()
    if ($pidValue) {
        $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
        if ($process) {
            taskkill /PID $process.Id /T /F | Out-Null
            $stopped = $true
            Write-Host "Stopped bridge PID $pidValue."
        }
    }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
    $escapedRoot = [Regex]::Escape($ProjectRoot)
    $matches = Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -match "uvicorn" -and $_.CommandLine -match "bridge\.server:app" -and $_.CommandLine -match $escapedRoot }
    foreach ($match in $matches) {
        taskkill /PID $match.ProcessId /T /F | Out-Null
        $stopped = $true
        Write-Host "Stopped bridge PID $($match.ProcessId)."
    }
}

if (-not $stopped) {
    Write-Host "Bridge was not running."
}
