[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetProfileId,

  [string]$SourceProfileId = "openai-codex:default",

  [string]$Provider = "openai-codex",

  [string]$AgentId = "main",

  [bool]$UpdateConfigMetadata = $true
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

function Add-UniqueOrdered {
  param(
    [string[]]$Items
  )

  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $result = @()
  foreach ($item in $Items) {
    if ([string]::IsNullOrWhiteSpace($item)) { continue }
    if ($seen.Add($item)) {
      $result += $item
    }
  }
  return ,$result
}

if (-not (Get-Command openclaw -ErrorAction SilentlyContinue)) {
  throw "openclaw command not found in PATH."
}

if ([string]::IsNullOrWhiteSpace($TargetProfileId)) {
  throw "TargetProfileId cannot be empty."
}
if ($TargetProfileId -eq $SourceProfileId) {
  throw "TargetProfileId cannot be the same as SourceProfileId."
}

$targetProvider = ($TargetProfileId -split ":", 2)[0]
if ($targetProvider -ne $Provider) {
  throw "Provider mismatch: target '$TargetProfileId' is not under '$Provider'."
}

$authPath = Join-Path $env:USERPROFILE ".openclaw\agents\$AgentId\agent\auth-profiles.json"
$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"

if (-not (Test-Path $authPath)) {
  throw "Auth store not found: $authPath"
}

$store = Get-Content $authPath -Raw | ConvertFrom-Json
if (-not $store.profiles) {
  throw "Invalid auth store: 'profiles' object missing."
}

$source = Get-PropValue -Object $store.profiles -Name $SourceProfileId
if (-not $source) {
  throw "Source profile not found: $SourceProfileId"
}

$targetBefore = Get-PropValue -Object $store.profiles -Name $TargetProfileId

$authBackup = "$authPath.bak.$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
Copy-Item -Path $authPath -Destination $authBackup -Force

# Deep clone to avoid linked references.
$cloned = $source | ConvertTo-Json -Depth 100 | ConvertFrom-Json
Set-PropValue -Object $store.profiles -Name $TargetProfileId -Value $cloned
Remove-PropIfExists -Object $store.profiles -Name $SourceProfileId

if (-not $store.order) {
  $store | Add-Member -NotePropertyName order -NotePropertyValue ([pscustomobject]@{}) -Force
}

$providerOrder = Get-PropValue -Object $store.order -Name $Provider
if ($providerOrder) {
  $next = @()
  foreach ($id in @($providerOrder)) {
    if ($id -eq $SourceProfileId) {
      $next += $TargetProfileId
    }
    else {
      $next += $id
    }
  }
  $next = Add-UniqueOrdered -Items $next
  Set-PropValue -Object $store.order -Name $Provider -Value @($next)
}

Write-JsonNoBom -Path $authPath -Object $store

$configBackup = $null
if ($UpdateConfigMetadata -and (Test-Path $configPath)) {
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
  Remove-PropIfExists -Object $cfg.auth.profiles -Name $SourceProfileId
  Write-JsonNoBom -Path $configPath -Object $cfg
}

$status = openclaw models status --json | ConvertFrom-Json
$providerRows = @($status.auth.oauth.profiles | Where-Object { $_.provider -eq $Provider } | Sort-Object profileId)

Write-Output "Profile promoted successfully."
Write-Output "Source: $SourceProfileId"
Write-Output "Target: $TargetProfileId"
if ($targetBefore) {
  Write-Output "Target previously existed: yes (overwritten)"
}
else {
  Write-Output "Target previously existed: no (created)"
}
Write-Output "Auth backup: $authBackup"
if ($configBackup) {
  Write-Output "Config backup: $configBackup"
}
Write-Output ("Provider profiles now: {0}" -f (($providerRows | ForEach-Object { $_.profileId }) -join ", "))
