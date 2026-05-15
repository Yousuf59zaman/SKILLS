[CmdletBinding()]
param(
  [string]$Provider = "openai-codex",
  [string]$LockedTailProfileId = "openai-codex:mail-usuf",
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command openclaw -ErrorAction SilentlyContinue)) {
  throw "openclaw command not found in PATH."
}

$status = openclaw models status --json | ConvertFrom-Json
$oauthProfiles = @($status.auth.oauth.profiles | Where-Object { $_.provider -eq $Provider })

if ($oauthProfiles.Count -eq 0) {
  throw "No OAuth profiles found for provider '$Provider'."
}

$mailByLetter = @(
  foreach ($row in $oauthProfiles) {
    if ($row.profileId -match "^$([regex]::Escape($Provider)):mail([A-Z])$") {
      [pscustomobject]@{
        profileId = $row.profileId
        letter    = $matches[1]
      }
    }
  }
)

$ordered = @($mailByLetter | Sort-Object letter | ForEach-Object { $_.profileId } | Select-Object -Unique)
$tailExists = (@($oauthProfiles | ForEach-Object { $_.profileId }) -contains $LockedTailProfileId)

if ($tailExists -and -not ($ordered -contains $LockedTailProfileId)) {
  $ordered += $LockedTailProfileId
}

if ($ordered.Count -eq 0) {
  throw "No lettered mail profiles found (expected IDs like '$Provider:mailA')."
}

if ($DryRun) {
  Write-Output ("Dry run order: {0}" -f ($ordered -join " -> "))
  return
}

openclaw models auth order set --provider $Provider @ordered | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to set auth order for provider '$Provider'."
}

$orderInfo = openclaw models auth order get --provider $Provider --json | ConvertFrom-Json
Write-Output ("Order set: {0}" -f (@($orderInfo.order) -join " -> "))
