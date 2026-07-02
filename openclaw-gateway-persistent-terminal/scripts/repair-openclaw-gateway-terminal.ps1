param(
  [switch]$OpenVisible,
  [switch]$SkipScheduledTaskUpdate
)

$ErrorActionPreference = 'Stop'

$openClawHome = Join-Path $env:USERPROFILE '.openclaw'
$workspaceDir = Join-Path $openClawHome 'workspace'
$port = 18789
$gatewayCmd = Join-Path $openClawHome 'gateway.cmd'
$manualCmd = Join-Path $openClawHome 'gateway-manual.cmd'
$serviceCmd = Join-Path $openClawHome 'gateway-service.cmd'
$monitorPs1 = Join-Path $openClawHome 'gateway-manual-monitor.ps1'
$supervisorPs1 = Join-Path $openClawHome 'gateway-supervisor.ps1'
$autostartPs1 = Join-Path $openClawHome 'gateway-autostart.ps1'
$liveLogPs1 = Join-Path $openClawHome 'gateway-live-log.ps1'
$liveLogCmd = Join-Path $openClawHome 'gateway-live-log.cmd'
$logDir = Join-Path $openClawHome 'logs'
$gatewayOutLog = Join-Path $logDir 'gateway-live.out.log'
$gatewayErrLog = Join-Path $logDir 'gateway-live.err.log'
$openclawCmd = Join-Path $env:APPDATA 'npm\openclaw.cmd'
$backupRoot = Join-Path $workspaceDir 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $backupRoot "gateway-persistent-terminal-$stamp"

function Write-Status {
  param([string]$Message)
  Write-Host "[gateway-terminal] $Message"
}

function Backup-IfExists {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Copy-Item -LiteralPath $Path -Destination (Join-Path $backupDir (Split-Path -Leaf $Path)) -Force
  }
}

function Test-GatewayPort {
  param([int]$TimeoutMs = 800)
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect('127.0.0.1', $port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch {}
  }
}

function Get-GatewayListenerProcess {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return $null }
  return Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $openClawHome)) {
  throw "OpenClaw home not found: $openClawHome"
}
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

foreach ($path in @($gatewayCmd, $manualCmd, $serviceCmd, $monitorPs1, $supervisorPs1, $autostartPs1, $liveLogPs1, $liveLogCmd)) {
  Backup-IfExists -Path $path
}
Write-Status "Backup saved: $backupDir"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$monitorContent = @'
$ErrorActionPreference = 'Continue'
$port = 18789
$hostName = '127.0.0.1'
$once = [string]$env:OPENCLAW_GATEWAY_MONITOR_ONCE -eq '1'

function Test-GatewayPort {
  param([int]$TimeoutMs = 800)
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($hostName, $port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch {}
  }
}

Write-Host ''
Write-Host 'OpenClaw gateway monitor attached to the existing gateway.' -ForegroundColor Cyan
Write-Host 'Enter dile window close hobe na. Close korte chaile Ctrl+C or window X.' -ForegroundColor Yellow
Write-Host 'This is a status window only; closing it will NOT stop the real gateway.' -ForegroundColor DarkGray
Write-Host ''

while ($true) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  if (Test-GatewayPort) {
    Write-Host ('[{0}] Gateway running: {1}:{2}' -f $ts, $hostName, $port) -ForegroundColor Green
  } else {
    Write-Host ('[{0}] Gateway port is not listening; supervisor/watchdog should restart it. Waiting...' -f $ts) -ForegroundColor Yellow
  }
  if ($once) { break }
  Start-Sleep -Seconds 15
}
'@
Set-Content -LiteralPath $monitorPs1 -Value $monitorContent -Encoding ASCII

$liveLogContent = @'
$ErrorActionPreference = 'Continue'
$openClawHome = Join-Path $env:USERPROFILE '.openclaw'
$logDir = Join-Path $openClawHome 'logs'
$files = @(
  @{ Path = (Join-Path $logDir 'gateway-supervisor.log'); Label = 'supervisor'; Color = 'Cyan' },
  @{ Path = (Join-Path $logDir 'gateway-live.out.log'); Label = 'gateway'; Color = 'Green' },
  @{ Path = (Join-Path $logDir 'gateway-live.err.log'); Label = 'gateway-err'; Color = 'Red' }
)
$positions = @{}

function Read-NewText {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  try {
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      $pos = 0L
      if ($positions.ContainsKey($Path)) { $pos = [int64]$positions[$Path] }
      if ($pos -gt $fs.Length) { $pos = 0L }
      $fs.Seek($pos, [System.IO.SeekOrigin]::Begin) | Out-Null
      $reader = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8, $true, 4096, $true)
      try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
      $positions[$Path] = $fs.Position
      return $text
    } finally { $fs.Dispose() }
  } catch {
    return ''
  }
}

Clear-Host
Write-Host 'OpenClaw Gateway LIVE LOG terminal' -ForegroundColor Yellow
Write-Host 'Eta real gateway/supervisor log tail kore. Close korle gateway bondho hobe na.' -ForegroundColor DarkGray
Write-Host 'Ctrl+C or window X diye sudhu ei log terminal close korte parba.' -ForegroundColor DarkGray
Write-Host ''

foreach ($f in $files) {
  if (Test-Path -LiteralPath $f.Path) {
    try { $positions[$f.Path] = [Math]::Max(0, (Get-Item -LiteralPath $f.Path).Length - 16000) } catch { $positions[$f.Path] = 0 }
  }
}

while ($true) {
  foreach ($f in $files) {
    $text = Read-NewText -Path $f.Path
    if (-not $text) { continue }
    $lines = $text -split "`r?`n"
    foreach ($line in $lines) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      Write-Host ('[{0}] {1}' -f $f.Label, $line) -ForegroundColor $f.Color
    }
  }
  Start-Sleep -Seconds 2
}
'@
Set-Content -LiteralPath $liveLogPs1 -Value $liveLogContent -Encoding UTF8

$liveLogCmdContent = @'
@echo off
rem Visible OpenClaw real gateway live-log terminal. Closing this window does not stop gateway.
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.openclaw\gateway-live-log.ps1"
'@
Set-Content -LiteralPath $liveLogCmd -Value $liveLogCmdContent -Encoding ASCII

$gatewayContent = @'
@echo off
rem OpenClaw Gateway supervised launcher.
rem Manual start: if another supervisor is already running, keep this terminal open as a live monitor.
rem Service/watchdog start: pass --service to exit cleanly without leaving hidden duplicate windows.
setlocal
set "OPENCLAW_GATEWAY_LAUNCH_MODE=manual"
if /I "%~1"=="--service" set "OPENCLAW_GATEWAY_LAUNCH_MODE=service"
if /I "%~1"=="/service" set "OPENCLAW_GATEWAY_LAUNCH_MODE=service"
if /I "%~1"=="service" set "OPENCLAW_GATEWAY_LAUNCH_MODE=service"

set "OPENCLAW_SERVICE_MANAGED_ENV_KEYS=PATH"
set "TMPDIR=%USERPROFILE%\AppData\Local\Temp"
set "OPENCLAW_GATEWAY_PORT=18789"
set "OPENCLAW_CODEX_APP_SERVER_MODE=yolo"
set "OPENCLAW_CODEX_APP_SERVER_APPROVAL_POLICY=never"
set "OPENCLAW_CODEX_APP_SERVER_SANDBOX=danger-full-access"
set "OPENCLAW_SYSTEMD_UNIT=openclaw-gateway.service"
set "OPENCLAW_WINDOWS_TASK_NAME=OpenClaw Gateway"
set "OPENCLAW_SERVICE_MARKER=openclaw"
set "OPENCLAW_SERVICE_KIND=gateway"
set "OPENCLAW_SERVICE_VERSION=2026.5.27"

C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.openclaw\gateway-supervisor.ps1" gateway --port 18789
set "OPENCLAW_GATEWAY_EXIT_CODE=%ERRORLEVEL%"

if /I not "%OPENCLAW_GATEWAY_LAUNCH_MODE%"=="service" if not "%OPENCLAW_GATEWAY_NO_MONITOR%"=="1" (
  echo.
  echo OpenClaw gateway launcher exited with code %OPENCLAW_GATEWAY_EXIT_CODE%.
  echo If another supervisor is already running, this terminal will stay open as a live status monitor.
  echo Press Ctrl+C or close this window if you only want to hide the monitor.
  C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.openclaw\gateway-manual-monitor.ps1"
)
exit /b %OPENCLAW_GATEWAY_EXIT_CODE%
'@
Set-Content -LiteralPath $gatewayCmd -Value $gatewayContent -Encoding ASCII

$manualContent = @'
@echo off
rem Visible/manual OpenClaw Gateway launcher. Starts a real live-log terminal plus a status monitor if gateway is already running.
if not "%OPENCLAW_GATEWAY_NO_LIVE_LOG%"=="1" start "OpenClaw Gateway Live Log" "%USERPROFILE%\.openclaw\gateway-live-log.cmd"
set "OPENCLAW_GATEWAY_NO_MONITOR="
call "%USERPROFILE%\.openclaw\gateway.cmd"
'@
Set-Content -LiteralPath $manualCmd -Value $manualContent -Encoding ASCII

$serviceContent = @'
@echo off
rem Non-interactive/service OpenClaw Gateway launcher. Used by watchdog/scheduled starts.
call "%USERPROFILE%\.openclaw\gateway.cmd" --service
'@
Set-Content -LiteralPath $serviceCmd -Value $serviceContent -Encoding ASCII

if (Test-Path -LiteralPath $supervisorPs1) {
  $lines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $supervisorPs1)
  $start = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -eq '  if (-not $hasMutex) {') { $start = $i; break }
  }
  if ($start -ge 0) {
    $end = $start
    while ($end -lt $lines.Count -and $lines[$end] -ne '  }') { $end++ }
    if ($end -lt $lines.Count) {
      $newLines = @(
        '  if (-not $hasMutex) {',
        '    $mode = [string]$env:OPENCLAW_GATEWAY_LAUNCH_MODE',
        "    Write-SupervisorLog 'Another OpenClaw gateway supervisor is already running; duplicate launcher will not start a second gateway.'",
        "    Write-SupervisorState -Status 'duplicate-exit' -Message 'Another supervisor instance already owns the mutex; existing gateway should remain active.'",
        "    if (`$mode -ne 'service') {",
        '      if (Test-GatewayPort) {',
        '        Write-SupervisorLog "Manual duplicate launch detected: gateway is already listening on 127.0.0.1:$gatewayPort."',
        '      } else {',
        '        Write-SupervisorLog "Manual duplicate launch detected: supervisor is active but port is not listening yet; wait a few seconds for restart."',
        '      }',
        '    }',
        '    exit 0',
        '  }'
      )
      $lines.RemoveRange($start, $end - $start + 1)
      $lines.InsertRange($start, [string[]]$newLines)
      Set-Content -LiteralPath $supervisorPs1 -Value $lines -Encoding UTF8
    }
  }
}

if (Test-Path -LiteralPath $supervisorPs1) {
  $supervisorText = Get-Content -LiteralPath $supervisorPs1 -Raw
  if ($supervisorText -notmatch '\$gatewayOutLog') {
    $supervisorText = $supervisorText.Replace(
      '$logFile = Join-Path $logDir ''gateway-supervisor.log''',
      '$logFile = Join-Path $logDir ''gateway-supervisor.log''' + "`r`n" +
      '$gatewayOutLog = Join-Path $logDir ''gateway-live.out.log''' + "`r`n" +
      '$gatewayErrLog = Join-Path $logDir ''gateway-live.err.log'''
    )
  }
  $plainStart = '$process = Start-Process -FilePath $nodeExe -ArgumentList @($openClawIndex, ''gateway'', ''--port'', [string]$gatewayPort) -WorkingDirectory $openClawHome -PassThru'
  $redirectStart = '$process = Start-Process -FilePath $nodeExe -ArgumentList @($openClawIndex, ''gateway'', ''--port'', [string]$gatewayPort) -WorkingDirectory $openClawHome -RedirectStandardOutput $gatewayOutLog -RedirectStandardError $gatewayErrLog -PassThru'
  if ($supervisorText.Contains($plainStart)) {
    $supervisorText = $supervisorText.Replace($plainStart, $redirectStart)
  }
  Set-Content -LiteralPath $supervisorPs1 -Value $supervisorText -Encoding UTF8
}

if (Test-Path -LiteralPath $autostartPs1) {
  $auto = Get-Content -LiteralPath $autostartPs1 -Raw
  $auto = $auto.Replace("('`"{0}`"' -f `$gatewayCmd)", "('`"{0}`" --service' -f `$gatewayCmd)")
  $auto = $auto.Replace("('`"{0}`" --service --service' -f `$gatewayCmd)", "('`"{0}`" --service' -f `$gatewayCmd)")
  Set-Content -LiteralPath $autostartPs1 -Value $auto -Encoding UTF8
}

if (-not $SkipScheduledTaskUpdate) {
  try {
    schtasks.exe /Change /TN "OpenClaw Gateway" /TR "$serviceCmd" | Out-Null
    Write-Status 'Scheduled task OpenClaw Gateway updated to gateway-service.cmd.'
  } catch {
    Write-Status 'Scheduled task update skipped/denied; files are still patched. Rerun elevated if scheduled action must be changed.'
  }
}

$env:OPENCLAW_GATEWAY_MONITOR_ONCE = '1'
try {
  & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy Bypass -File $monitorPs1 | Out-Host
} finally {
  Remove-Item Env:\OPENCLAW_GATEWAY_MONITOR_ONCE -ErrorAction SilentlyContinue
}

$listenerProc = Get-GatewayListenerProcess
if ($listenerProc) {
  Write-Status ("Gateway listening on 127.0.0.1:{0}; pid={1}; uptimeMinutes={2}" -f $port, $listenerProc.Id, [math]::Round(((Get-Date) - $listenerProc.StartTime).TotalMinutes, 2))
} else {
  Write-Status "Gateway is not currently listening on 127.0.0.1:$port. Starting visible/manual launcher."
  $OpenVisible = $true
}

if (Test-Path -LiteralPath $openclawCmd) {
  try { & $openclawCmd config validate --json | Out-Host } catch { Write-Status "Config validation failed: $($_.Exception.Message)" }
  try { & $openclawCmd health --json | Out-Host } catch { Write-Status "Health check failed: $($_.Exception.Message)" }
}

if ($OpenVisible) {
  Start-Process -FilePath $env:ComSpec -ArgumentList @('/k', ('"{0}"' -f $manualCmd)) -WorkingDirectory $openClawHome -WindowStyle Normal
  Write-Status "Visible persistent gateway terminal launched: $manualCmd"
}

Write-Status 'Done.'
