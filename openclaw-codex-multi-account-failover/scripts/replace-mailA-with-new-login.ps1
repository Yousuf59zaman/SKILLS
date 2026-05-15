[CmdletBinding()]
param(
  [string]$AgentId = "main",
  [string]$Provider = "openai-codex",
  [string]$TargetProfileId = "openai-codex:mailA",
  [string]$KeepProfileId = "openai-codex:mailB",
  [string]$SourceProfileId = "openai-codex:default"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PropValue {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not $Object) { return $null }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $null }
  return $prop.Value
}

function Set-PropValue {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)]$Value
  )

  if ($Object.PSObject.Properties[$Name]) {
    $Object.$Name = $Value
  }
  else {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
  }
}

function Remove-PropIfExists {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not $Object) { return }
  if ($Object.PSObject.Properties[$Name]) {
    [void]$Object.PSObject.Properties.Remove($Name)
  }
}

function Write-JsonNoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Object
  )

  $json = $Object | ConvertTo-Json -Depth 100
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

$authPath = Join-Path $env:USERPROFILE ".openclaw\agents\$AgentId\agent\auth-profiles.json"
$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"

if (-not (Get-Command openclaw -ErrorAction SilentlyContinue)) {
  throw "openclaw command not found in PATH."
}
if (-not (Test-Path $authPath)) {
  throw "Auth store not found: $authPath"
}

Write-Host ""
Write-Host "This helper will:" -ForegroundColor Cyan
Write-Host "  1) Run interactive OAuth sign-in for a NEW Codex mail account."
Write-Host "  2) Copy $SourceProfileId -> $TargetProfileId."
Write-Host "  3) Keep $KeepProfileId unchanged."
Write-Host "  4) Remove temporary $SourceProfileId."
Write-Host "  5) Enforce order: $TargetProfileId -> $KeepProfileId."
Write-Host ""
Write-Host "Run this in ONE PowerShell window only. Avoid parallel auth/profile commands." -ForegroundColor Yellow
Read-Host "Press Enter to continue"

openclaw models status --json | Out-Null
openclaw models auth order get --provider $Provider --json | Out-Null

openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
if ($LASTEXITCODE -ne 0) {
  throw "Onboarding OAuth step failed or was cancelled."
}

$store = Get-Content $authPath -Raw | ConvertFrom-Json
if (-not $store.profiles) {
  throw "Invalid auth store: 'profiles' object missing."
}

$source = Get-PropValue -Object $store.profiles -Name $SourceProfileId
if (-not $source) {
  throw "Expected source profile not found after login: $SourceProfileId"
}

$keep = Get-PropValue -Object $store.profiles -Name $KeepProfileId
if (-not $keep) {
  throw "Required keep profile missing: $KeepProfileId"
}

$authBackup = "$authPath.bak.$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
Copy-Item -Path $authPath -Destination $authBackup -Force

# Deep clone so target does not share references with source.
$cloned = $source | ConvertTo-Json -Depth 100 | ConvertFrom-Json
Set-PropValue -Object $store.profiles -Name $TargetProfileId -Value $cloned
Remove-PropIfExists -Object $store.profiles -Name $SourceProfileId

if (-not $store.order) {
  $store | Add-Member -NotePropertyName order -NotePropertyValue ([pscustomobject]@{}) -Force
}
Set-PropValue -Object $store.order -Name $Provider -Value @($TargetProfileId, $KeepProfileId)

Write-JsonNoBom -Path $authPath -Object $store

$configBackup = $null
if (Test-Path $configPath) {
  $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
  $configBackup = "$configPath.bak.$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
  Copy-Item -Path $configPath -Destination $configBackup -Force

  if (-not $cfg.auth) {
    $cfg | Add-Member -NotePropertyName auth -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  if (-not $cfg.auth.profiles) {
    $cfg.auth | Add-Member -NotePropertyName profiles -NotePropertyValue ([pscustomobject]@{}) -Force
  }

  Set-PropValue -Object $cfg.auth.profiles -Name $TargetProfileId -Value ([pscustomobject]@{
      provider = $Provider
      mode     = "oauth"
    })

  if (-not (Get-PropValue -Object $cfg.auth.profiles -Name $KeepProfileId)) {
    Set-PropValue -Object $cfg.auth.profiles -Name $KeepProfileId -Value ([pscustomobject]@{
        provider = $Provider
        mode     = "oauth"
      })
  }

  Remove-PropIfExists -Object $cfg.auth.profiles -Name $SourceProfileId
  Write-JsonNoBom -Path $configPath -Object $cfg
}

openclaw models auth order set --provider $Provider $TargetProfileId $KeepProfileId | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to set order override for $Provider."
}

$orderInfo = openclaw models auth order get --provider $Provider --json | ConvertFrom-Json
$status = openclaw models status --json | ConvertFrom-Json
$providerRows = @($status.auth.oauth.profiles | Where-Object { $_.provider -eq $Provider } | Sort-Object profileId)

Write-Host ""
Write-Host "Done. Rotation summary:" -ForegroundColor Green
Write-Host "  Auth backup:   $authBackup"
if ($configBackup) {
  Write-Host "  Config backup: $configBackup"
}
Write-Host ("  Order: {0}" -f (@($orderInfo.order) -join " -> "))
Write-Host ("  Profiles: {0}" -f (($providerRows | ForEach-Object { $_.profileId }) -join ", "))
Write-Host ""
Read-Host "Press Enter to close"
