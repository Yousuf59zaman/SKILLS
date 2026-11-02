#Requires -Version 7.0
# Invoke-MuseTask.ps1 — Codex-side launcher: runs substantive work on pinned Muse via OpenCode CLI.
# Requires installed PowerShell 7; invoke with: pwsh -NoProfile -File <this script> -Prompt '...' -WorkingDirectory <dir>
# Usage:
#   pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\scripts\Invoke-MuseTask.ps1') -Prompt 'task...' -WorkingDirectory (Get-Location).Path
#   pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\scripts\Invoke-MuseTask.ps1') -PromptFile .\prompt.txt -WorkingDirectory (Get-Location).Path [-SessionId <id>] [-files <paths>] [-AutoApprove]
# Notes: no model/provider/executable override; explicit --model always; --session only when -SessionId given
# (never --continue/--fork); --auto only with -AutoApprove for user-authorized actions.
[CmdletBinding(DefaultParameterSetName = 'Prompt')]
param(
  [Parameter(ParameterSetName = 'Prompt', Mandatory = $true, Position = 0)]
  [string]$Prompt,
  [Parameter(ParameterSetName = 'PromptFile', Mandatory = $true)]
  [string]$PromptFile,
  [string]$WorkingDirectory = (Get-Location).Path,
  [string]$SessionId = '',
  [string[]]$files = @(),
  [switch]$AutoApprove
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Ordinary runtime repair (process PATH only): prepend the existing
# WindowsPowerShell v1.0 system folder when powershell.exe is not resolvable.
# Verifies the executable exists, retains all existing PATH entries, and makes
# no machine/user persistent environment changes.
if (-not (Get-Command -Name 'powershell.exe' -ErrorAction SilentlyContinue)) {
  $museSysRoot = if (-not [string]::IsNullOrWhiteSpace($env:SystemRoot)) { $env:SystemRoot } else { 'C:\Windows' }
  $musePsDir = Join-Path $museSysRoot 'System32\WindowsPowerShell\v1.0'
  $musePsExe = Join-Path $musePsDir 'powershell.exe'
  if (Test-Path -LiteralPath $musePsExe -PathType Leaf) {
    if ([string]::IsNullOrEmpty($env:PATH)) { $env:PATH = $musePsDir }
    elseif ($env:PATH -notlike "*$musePsDir*") { $env:PATH = "$musePsDir;$env:PATH" }
  }
}

. (Join-Path $PSScriptRoot 'MuseTaskCore.ps1')

if ($PSCmdlet.ParameterSetName -eq 'PromptFile') {
  Invoke-MuseTaskMain -PromptFile $PromptFile -WorkingDirectory $WorkingDirectory -SessionId $SessionId -Files $files -AutoApprove:([bool]$AutoApprove)
} else {
  Invoke-MuseTaskMain -Prompt $Prompt -WorkingDirectory $WorkingDirectory -SessionId $SessionId -Files $files -AutoApprove:([bool]$AutoApprove)
}
