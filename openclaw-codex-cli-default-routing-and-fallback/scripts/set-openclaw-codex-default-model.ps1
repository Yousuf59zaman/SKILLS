[CmdletBinding()]
param(
  [string]$Model = "codex-cli/gpt-5.3-codex"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
  Get-Command openclaw -ErrorAction Stop | Out-Null
} catch {
  throw "OpenClaw CLI is not available in PATH."
}

Write-Output ("Setting OpenClaw default model to: {0}" -f $Model)
openclaw models set $Model | Out-Host

$statusRaw = openclaw models status --json
$status = $statusRaw | ConvertFrom-Json -ErrorAction Stop

Write-Output ("defaultModel: {0}" -f $status.defaultModel)
Write-Output ("resolvedDefault: {0}" -f $status.resolvedDefault)

if ($status.resolvedDefault -ne $Model) {
  throw ("Resolved model mismatch. Expected '{0}', got '{1}'." -f $Model, $status.resolvedDefault)
}

Write-Output "OpenClaw default model is correctly set."
