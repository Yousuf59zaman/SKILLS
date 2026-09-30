[CmdletBinding()]
param(
  [ValidateSet('openclaw')][string]$BrowserProfile = 'openclaw',
  [switch]$Preflight
)

$ErrorActionPreference = 'Stop'
$root = 'C:\Users\User\.openclaw'
$workspace = Join-Path $root 'workspace'
$openclaw = Join-Path $env:APPDATA 'npm\openclaw.cmd'
$windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nodeScript = Join-Path $workspace 'skills\fb-second-brain\scripts\drain-messenger-queue.mjs'
$queueWorker = Join-Path $workspace 'skills\fb-second-brain\scripts\queue-worker.mjs'
$loginHelper = Join-Path $workspace 'skills\fb-second-brain\scripts\messenger-login-helper.ps1'
$pinHelper = Join-Path $workspace 'skills\fb-second-brain\scripts\messenger-pin-helper.ps1'
$script:failureClass = 'runner_unavailable'
$script:browserTargetId = $null

function Write-SafeJson {
  param([hashtable]$Value)
  $Value | ConvertTo-Json -Compress
}

function Open-MessengerPage {
  $script:failureClass = 'browser_unavailable'
  & $openclaw browser --browser-profile $BrowserProfile start | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to start the cron browser profile.' }
  $raw = & $openclaw browser --json --browser-profile $BrowserProfile open 'https://www.facebook.com/messages/' 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Unable to open Messenger in the cron browser profile.' }
  $opened = $null
  try { $opened = $raw | Out-String | ConvertFrom-Json } catch {}
  $candidateTargetId = [string]$opened.targetId
  if ($candidateTargetId -notmatch '^[A-Fa-f0-9]{16,64}$') {
    throw 'The cron browser did not return a dedicated Messenger tab identifier.'
  }
  $script:browserTargetId = $candidateTargetId
  & $openclaw browser --browser-profile $BrowserProfile focus $script:browserTargetId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to focus the dedicated Messenger tab.' }
  Start-Sleep -Seconds 3
}

function Invoke-Helper {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Action
  )
  $raw = & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $Path -Action $Action -BrowserProfile $BrowserProfile -TargetId $script:browserTargetId 2>&1
  $exitCode = $LASTEXITCODE
  $parsed = $null
  try { $parsed = $raw | Out-String | ConvertFrom-Json } catch {}
  return [pscustomobject]@{ ExitCode = $exitCode; Value = $parsed }
}

function Write-BlockedResult {
  param([string]$FailureClass)
  $finalLine = switch ($FailureClass) {
    'queue_status_unavailable' { 'Messenger queue data could not be verified. Jobs retained; manual review is required before retry.' }
    'login_unverified' { 'Messenger login could not be verified. Queue retained; please open Messenger in the openclaw browser.' }
    'pin_unverified' { 'Messenger chat-history restore needs attention. Queue retained; please open Messenger in the openclaw browser.' }
    'browser_unavailable' { 'Messenger browser is unavailable. Queue retained; the next run will retry safely.' }
    default { 'Messenger queue runner is unavailable. Queue retained; the next run will retry safely.' }
  }
  Write-SafeJson @{
    ok = $false
    status = 'preflight_blocked'
    error_code = $FailureClass
    queue_retained = $true
    finalLine = $finalLine
  }
}

try {
  if (-not (Test-Path -LiteralPath $openclaw -PathType Leaf)) { throw 'OpenClaw CLI is unavailable.' }
  if (-not (Test-Path -LiteralPath $windowsPowerShell -PathType Leaf)) { throw 'Windows PowerShell is unavailable.' }

  if (-not $Preflight) {
    $script:failureClass = 'queue_status_unavailable'
    $statusRaw = & $node $queueWorker status
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read Messenger queue status.' }
    $status = $statusRaw | Out-String | ConvertFrom-Json
    if (([int]$status.pending + [int]$status.processing) -eq 0) {
      Write-SafeJson @{ ok = $true; status = 'empty'; finalLine = 'NO_REPLY' }
      exit 0
    }
    if ($status.lock -and $status.lock.expires_at -and ([DateTimeOffset]::Parse([string]$status.lock.expires_at) -gt [DateTimeOffset]::Now)) {
      Write-SafeJson @{ ok = $true; status = 'busy'; finalLine = 'NO_REPLY' }
      exit 0
    }
  }

  Open-MessengerPage

  $script:failureClass = 'login_unverified'
  $loginAction = if ($Preflight) { 'Status' } else { 'Login' }
  $loginResult = Invoke-Helper -Path $loginHelper -Action $loginAction
  $login = $loginResult.Value
  if ($loginResult.ExitCode -eq 2 -and $login -and $login.two_factor_required) {
    Write-SafeJson @{
      ok = $false
      status = 'two_factor_required'
      queue_retained = $true
      finalLine = 'Messenger login needs 2-step verification. Queue retained; please complete it in the openclaw browser.'
    }
    exit 0
  }
  if ($loginResult.ExitCode -ne 0 -or -not $login -or -not $login.ok) {
    throw 'Messenger login could not be verified safely.'
  }

  $script:failureClass = 'pin_unverified'
  $pinAction = if ($Preflight) { 'Status' } else { 'Submit' }
  $pinResult = Invoke-Helper -Path $pinHelper -Action $pinAction
  $pin = $pinResult.Value
  if ($pinResult.ExitCode -ne 0 -or -not $pin -or -not $pin.ok) {
    throw 'Messenger chat-history PIN could not be verified safely.'
  }

  if ($Preflight) {
    $script:failureClass = 'runner_preflight_failed'
    & $node $nodeScript --preflight --credentials-preverified --profile $BrowserProfile --target-id $script:browserTargetId
    exit $LASTEXITCODE
  }

  $script:failureClass = 'queue_drain_failed'
  & $node $nodeScript --login-preverified --pin-preverified --profile $BrowserProfile --target-id $script:browserTargetId
  exit $LASTEXITCODE
} catch {
  Write-BlockedResult -FailureClass $script:failureClass
  if ($Preflight) { exit 1 }
  exit 0
} finally {
  if ($script:browserTargetId -match '^[A-Fa-f0-9]{16,64}$') {
    & $openclaw browser --browser-profile $BrowserProfile close $script:browserTargetId 2>&1 | Out-Null
  }
}
