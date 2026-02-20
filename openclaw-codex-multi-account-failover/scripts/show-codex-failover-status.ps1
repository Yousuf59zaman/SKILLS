[CmdletBinding()]
param(
  [string]$Provider = "openai-codex"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-JsonFromCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  $raw = Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command"
  }
  return $raw | ConvertFrom-Json
}

$status = Read-JsonFromCommand -Command "openclaw models status --json"
$orderInfo = Read-JsonFromCommand -Command "openclaw models auth order get --provider $Provider --json"

$providerAuth = @($status.auth.oauth.providers | Where-Object { $_.provider -eq $Provider })
if ($providerAuth.Count -eq 0) {
  throw "Provider '$Provider' was not found in openclaw models status."
}

$oauthProfiles = @($providerAuth[0].profiles | Where-Object { $_.profileId })
$orderList = @($orderInfo.order)

Write-Output "Provider: $Provider"
Write-Output ("OAuth profiles found: {0}" -f $oauthProfiles.Count)
foreach ($p in $oauthProfiles) {
  Write-Output ("  - {0} ({1})" -f $p.profileId, $p.status)
}

if ($orderList.Count -gt 0) {
  Write-Output ("Failover order: {0}" -f ($orderList -join " -> "))
}
else {
  Write-Output "Failover order: not set (OpenClaw will use round-robin behavior)."
}

Write-Output ""
Write-Output "Chat commands:"
Write-Output "  /new"
Write-Output "  /model openai-codex/gpt-5.2-codex"
if ($orderList.Count -gt 0) {
  Write-Output ("  /model openai-codex/gpt-5.2-codex@{0}" -f $orderList[0])
}
