[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetProfileId,

  [string]$Provider = "openai-codex",

  [string]$AgentId = "main",

  [string]$TempSourceProfileId = "openai-codex:default",

  [string]$LockedTailProfileId = "openai-codex:mail-usuf",

  [int]$PostLoginPollSeconds = 20,

  [ValidateRange(1, 5)]
  [int]$MaxLoginAttempts = 2,

  [switch]$SkipInteractiveLogin
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

function Read-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  return (Get-Content -Path $Path -Raw | ConvertFrom-Json)
}

function Get-ProviderProfileChangeSet {
  param(
    [Parameter(Mandatory = $true)]$BaselineStore,
    [Parameter(Mandatory = $true)]$PostStore,
    [Parameter(Mandatory = $true)][string]$ProviderId
  )

  $baselineMap = @{}
  foreach ($id in @($BaselineStore.profiles.PSObject.Properties.Name)) {
    if ($id -like "${ProviderId}:*") {
      $baselineMap[$id] = (Get-PropValue -Object $BaselineStore.profiles -Name $id | ConvertTo-Json -Depth 100 -Compress)
    }
  }

  $changes = @()
  foreach ($id in @($PostStore.profiles.PSObject.Properties.Name)) {
    if ($id -notlike "${ProviderId}:*") { continue }
    $data = Get-PropValue -Object $PostStore.profiles -Name $id
    $json = $data | ConvertTo-Json -Depth 100 -Compress

    $kind = $null
    if (-not $baselineMap.ContainsKey($id)) {
      $kind = "new"
    }
    elseif ($baselineMap[$id] -ne $json) {
      $kind = "changed"
    }

    if (-not $kind) { continue }

    $expires = 0L
    $expVal = Get-PropValue -Object $data -Name "expiresAt"
    if ($null -ne $expVal) {
      try {
        $expires = [long]$expVal
      }
      catch {
        $expires = 0L
      }
    }

    $changes += [pscustomobject]@{
      profileId = $id
      kind      = $kind
      expiresAt = $expires
      data      = $data
    }
  }

  return ,$changes
}

if (-not (Get-Command openclaw -ErrorAction SilentlyContinue)) {
  throw "openclaw command not found in PATH."
}

if ([string]::IsNullOrWhiteSpace($TargetProfileId)) {
  throw "TargetProfileId cannot be empty."
}
if ([string]::IsNullOrWhiteSpace($Provider)) {
  throw "Provider cannot be empty."
}
if ($TargetProfileId -notlike "${Provider}:*") {
  throw "Target profile '$TargetProfileId' does not belong to provider '$Provider'."
}
if ($PostLoginPollSeconds -lt 0) {
  throw "PostLoginPollSeconds cannot be negative."
}

$authPath = Join-Path $env:USERPROFILE ".openclaw\agents\$AgentId\agent\auth-profiles.json"
$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"

if (-not (Test-Path $authPath)) {
  throw "Auth store not found: $authPath"
}

$baselineStore = Read-JsonFile -Path $authPath
if (-not $baselineStore.profiles) {
  throw "Invalid auth store: 'profiles' object missing."
}

$baselineTarget = Get-PropValue -Object $baselineStore.profiles -Name $TargetProfileId

$sourceProfileId = $null
$sourceData = $null
$sourceReason = $null
$postStore = $null

$attempt = 0
$attemptLimit = $MaxLoginAttempts
if ($SkipInteractiveLogin) {
  $attemptLimit = 1
}

while (($attempt -lt $attemptLimit) -and (-not $sourceData)) {
  $attempt++

  if (-not $SkipInteractiveLogin) {
    Write-Host ""
    Write-Host ("Starting OAuth attempt {0}/{1}..." -f $attempt, $attemptLimit) -ForegroundColor Cyan
    Write-Host ("Target placement: {0}" -f $TargetProfileId) -ForegroundColor Cyan
    Write-Host "Important: if prompted to paste code/URL, paste ONLY the localhost callback URL with '?code=' (or just the code)." -ForegroundColor Yellow
    Write-Host "Do NOT paste the auth.openai.com/oauth/authorize URL." -ForegroundColor Yellow
    Write-Host ""

    openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
    if ($LASTEXITCODE -ne 0) {
      throw "Onboarding OAuth step failed or was cancelled."
    }
  }

  $deadline = (Get-Date).AddSeconds($PostLoginPollSeconds)
  $postStore = $null
  do {
    try {
      $postStore = Read-JsonFile -Path $authPath
      if ($postStore -and $postStore.profiles) {
        break
      }
    }
    catch {
      # transient file read/parse while OpenClaw writes
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  if (-not $postStore -or -not $postStore.profiles) {
    if ($attempt -lt $attemptLimit) {
      Write-Warning "Auth store was not readable after onboarding. Retrying OAuth..."
      continue
    }
    throw "Unable to read a valid auth store after login."
  }

  $defaultAfter = Get-PropValue -Object $postStore.profiles -Name $TempSourceProfileId
  if ($defaultAfter) {
    $sourceProfileId = $TempSourceProfileId
    $sourceData = $defaultAfter
    $sourceReason = "default-profile"
    break
  }
  else {
    $changeSet = Get-ProviderProfileChangeSet -BaselineStore $baselineStore -PostStore $postStore -ProviderId $Provider
    if ($changeSet.Count -eq 0) {
      if ($attempt -lt $attemptLimit) {
        Write-Warning "No new/changed OpenAI Codex profile detected after OAuth. Retrying once more."
        continue
      }
      break
    }

    if ($changeSet.Count -eq 1) {
      $sourceProfileId = $changeSet[0].profileId
      $sourceData = $changeSet[0].data
      $sourceReason = "single-delta"
      break
    }
    else {
      $sorted = @($changeSet | Sort-Object expiresAt -Descending)
      $first = $sorted[0]
      $second = $sorted[1]
      if ($first.expiresAt -eq $second.expiresAt) {
        $ids = ($sorted | ForEach-Object { $_.profileId }) -join ", "
        throw "Ambiguous post-login source profile (multiple changes with same priority): $ids"
      }
      $sourceProfileId = $first.profileId
      $sourceData = $first.data
      $sourceReason = "max-expiresAt-delta"
      break
    }
  }
}

if (-not $sourceData) {
  throw "No new/changed '$Provider' profile was detected after $attemptLimit OAuth attempt(s). If prompted, paste only the localhost callback URL containing '?code=' (or just the code), not the auth.openai.com/oauth/authorize URL."
}

$sourceProvider = Get-PropValue -Object $sourceData -Name "provider"
if ($sourceProvider -and ($sourceProvider -ne $Provider)) {
  throw "Resolved source profile '$sourceProfileId' has provider '$sourceProvider', expected '$Provider'."
}

$finalStore = $baselineStore | ConvertTo-Json -Depth 100 | ConvertFrom-Json
if (-not $finalStore.profiles) {
  throw "Invalid baseline auth store: 'profiles' object missing."
}

$cloned = $sourceData | ConvertTo-Json -Depth 100 | ConvertFrom-Json
Set-PropValue -Object $finalStore.profiles -Name $TargetProfileId -Value $cloned

if ($TargetProfileId -ne $TempSourceProfileId) {
  Remove-PropIfExists -Object $finalStore.profiles -Name $TempSourceProfileId
}

$authBackup = "$authPath.bak.$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
Copy-Item -Path $authPath -Destination $authBackup -Force
Write-JsonNoBom -Path $authPath -Object $finalStore

$configBackup = $null
if (Test-Path $configPath) {
  $cfg = Read-JsonFile -Path $configPath
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

  if ($TargetProfileId -ne $TempSourceProfileId) {
    Remove-PropIfExists -Object $cfg.auth.profiles -Name $TempSourceProfileId
  }

  Write-JsonNoBom -Path $configPath -Object $cfg
}

$orderScript = Join-Path $PSScriptRoot "set-codex-order-alpha-with-usuf-tail.ps1"
if (-not (Test-Path $orderScript)) {
  throw "Order helper script not found: $orderScript"
}

[void](& $orderScript -Provider $Provider -LockedTailProfileId $LockedTailProfileId)

$orderInfo = openclaw models auth order get --provider $Provider --json | ConvertFrom-Json
$status = openclaw models status --json | ConvertFrom-Json
$providerRows = @($status.auth.oauth.profiles | Where-Object { $_.provider -eq $Provider } | Sort-Object profileId)
$targetAfter = $providerRows | Where-Object { $_.profileId -eq $TargetProfileId } | Select-Object -First 1

Write-Host ""
Write-Host "Placement complete." -ForegroundColor Green
Write-Host "  Target: $TargetProfileId"
Write-Host "  Source used: $sourceProfileId ($sourceReason)"
if ($targetAfter) {
  Write-Host ("  Target expiresAt: {0}" -f $targetAfter.expiresAt)
}
if ($baselineTarget) {
  $beforeExp = Get-PropValue -Object $baselineTarget -Name "expiresAt"
  Write-Host ("  Target existed before: yes (previous expiresAt {0})" -f $beforeExp)
}
else {
  Write-Host "  Target existed before: no"
}
Write-Host "  Auth backup:   $authBackup"
if ($configBackup) {
  Write-Host "  Config backup: $configBackup"
}
Write-Host ("  Order: {0}" -f (@($orderInfo.order) -join " -> "))
Write-Host ("  Profiles: {0}" -f (($providerRows | ForEach-Object { $_.profileId }) -join ", "))
