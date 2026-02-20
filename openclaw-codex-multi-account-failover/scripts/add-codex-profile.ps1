[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$NewProfileId,

  [string]$SourceProfileId = "openai-codex:default",

  [string]$AgentId = "main",

  [ValidateSet("append", "prepend", "none")]
  [string]$OrderAction = "append",

  [switch]$UpdateConfigMetadata
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

function Add-UniqueOrdered {
  param(
    [string[]]$Items
  )

  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $result = @()
  foreach ($item in $Items) {
    if ([string]::IsNullOrWhiteSpace($item)) { continue }
    if ($seen.Add($item)) { $result += $item }
  }
  return ,$result
}

$agentRoot = Join-Path $env:USERPROFILE ".openclaw\agents\$AgentId\agent"
$authPath = Join-Path $agentRoot "auth-profiles.json"
if (-not (Test-Path $authPath)) {
  throw "Auth store not found: $authPath"
}

$authBackup = "$authPath.bak.$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
Copy-Item -Path $authPath -Destination $authBackup -Force

$store = Get-Content $authPath -Raw | ConvertFrom-Json
if (-not $store.profiles) {
  throw "Invalid auth store: 'profiles' object missing."
}

$source = Get-PropValue -Object $store.profiles -Name $SourceProfileId
if (-not $source) {
  throw "Source profile not found: $SourceProfileId"
}

$existingTarget = Get-PropValue -Object $store.profiles -Name $NewProfileId
if ($existingTarget) {
  throw "Target profile already exists: $NewProfileId"
}

$newProvider = ($NewProfileId -split ":", 2)[0]
if ([string]::IsNullOrWhiteSpace($newProvider)) {
  throw "Invalid NewProfileId format. Expected 'provider:name', got: $NewProfileId"
}

if ($source.provider -and ($source.provider -ne $newProvider)) {
  throw "Provider mismatch: source is '$($source.provider)' but target id uses '$newProvider'."
}

# Deep copy to avoid linked references in memory
$cloned = $source | ConvertTo-Json -Depth 100 | ConvertFrom-Json
Set-PropValue -Object $store.profiles -Name $NewProfileId -Value $cloned

if (-not $store.order) {
  $store | Add-Member -NotePropertyName order -NotePropertyValue ([pscustomobject]@{}) -Force
}

$currentOrder = @()
$providerOrder = Get-PropValue -Object $store.order -Name $newProvider
if ($providerOrder) {
  $currentOrder = @($providerOrder)
}

if ($OrderAction -eq "append") {
  $currentOrder += $NewProfileId
}
elseif ($OrderAction -eq "prepend") {
  $currentOrder = @($NewProfileId) + $currentOrder
}

if ($OrderAction -ne "none") {
  $nextOrder = Add-UniqueOrdered -Items $currentOrder
  Set-PropValue -Object $store.order -Name $newProvider -Value @($nextOrder)
}

$store | ConvertTo-Json -Depth 100 | Set-Content $authPath -Encoding UTF8

$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
$configUpdated = $false
if ($UpdateConfigMetadata -and (Test-Path $configPath)) {
  $configBackup = "$configPath.bak.$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
  Copy-Item -Path $configPath -Destination $configBackup -Force

  $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
  if (-not $cfg.auth) {
    $cfg | Add-Member -NotePropertyName auth -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  if (-not $cfg.auth.profiles) {
    $cfg.auth | Add-Member -NotePropertyName profiles -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  Set-PropValue -Object $cfg.auth.profiles -Name $NewProfileId -Value ([pscustomobject]@{
      provider = $newProvider
      mode     = "oauth"
    })
  $cfg | ConvertTo-Json -Depth 100 | Set-Content $configPath -Encoding UTF8
  $configUpdated = $true
}

$finalOrder = Get-PropValue -Object $store.order -Name $newProvider

Write-Output "Profile copied successfully."
Write-Output "Source: $SourceProfileId"
Write-Output "Target: $NewProfileId"
Write-Output "Auth store: $authPath"
Write-Output "Auth backup: $authBackup"
if ($OrderAction -eq "none") {
  Write-Output "Order action: none (order unchanged)"
}
else {
  Write-Output "Order action: $OrderAction"
  Write-Output ("Current order ({0}): {1}" -f $newProvider, (@($finalOrder) -join " -> "))
}
if ($configUpdated) {
  Write-Output "Config metadata updated: $configPath"
}
else {
  Write-Output "Config metadata not changed."
}
