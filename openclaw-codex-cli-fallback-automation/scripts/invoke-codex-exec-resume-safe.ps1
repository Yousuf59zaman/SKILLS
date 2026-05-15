[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Prompt,
  [string]$SessionId,
  [switch]$Last,
  [string]$Model = "gpt-5.3-codex",
  [switch]$Json,
  [switch]$SkipGitRepoCheck = $true,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Last -and -not [string]::IsNullOrWhiteSpace($SessionId)) {
  throw "Use either -Last or -SessionId, not both."
}

if (-not $Last -and [string]::IsNullOrWhiteSpace($SessionId)) {
  $Last = $true
}

try {
  Get-Command codex -ErrorAction Stop | Out-Null
} catch {
  throw "Codex CLI is not available in PATH."
}

$args = @("exec", "resume")
if ($Last) {
  $args += "--last"
} else {
  $args += $SessionId
}

if (-not [string]::IsNullOrWhiteSpace($Model)) {
  $args += "-m"
  $args += $Model
}

if ($Json) {
  $args += "--json"
}

if ($SkipGitRepoCheck) {
  $args += "--skip-git-repo-check"
}

# Pass prompt over stdin ("-") to prevent shell tokenization from splitting words
# into unexpected extra CLI arguments.
$args += "-"

if ($DryRun) {
  Write-Output ("Command: codex {0}" -f ($args -join " "))
  Write-Output ("PromptChars: {0}" -f $Prompt.Length)
  return
}

$Prompt | & codex @args
$exit = $LASTEXITCODE
if ($exit -ne 0) {
  throw "Codex CLI returned exit code $exit."
}
