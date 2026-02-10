[CmdletBinding()]
param(
  # Path to the Codex skills repo. Default: parent of this script's folder.
  [string]$CodexSkillsDir = '',

  # Where to sync skills into.
  [string]$ClaudeSkillsDir = "$env:USERPROFILE\.claude\skills",
  [string]$GeminiSkillsDir = "$env:USERPROFILE\.gemini\antigravity\skills",

  # Install per-machine automation
  [switch]$SkipGitHooks,
  [switch]$SkipStartup,

  # Don't run an initial sync after installing hooks/startup.
  [switch]$SkipInitialSync,

  # Reduce console output.
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
  )

  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[$ts][$Level] $Message"
  if (-not $Quiet) { Write-Host $line }
}

function Assert-Exe {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required executable not found on PATH: $Name"
  }
}

function Write-TextFileAscii {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content,
    [switch]$CrLf
  )

  $dir = Split-Path -Parent $Path
  if ($dir) {
    New-Item -ItemType Directory -Force $dir | Out-Null
  }

  if ($CrLf) {
    $Content = ($Content -replace "`r?`n", "`r`n")
  } else {
    $Content = ($Content -replace "`r?`n", "`n")
  }

  Set-Content -NoNewline -LiteralPath $Path -Value $Content -Encoding Ascii
}

if ([string]::IsNullOrWhiteSpace($CodexSkillsDir)) {
  if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    throw 'Unable to infer CodexSkillsDir. Pass -CodexSkillsDir explicitly.'
  }
  $CodexSkillsDir = (Split-Path -Parent $PSScriptRoot)
}

$repoRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($CodexSkillsDir)
$syncScript = Join-Path $repoRoot '.github\sync-skills.ps1'

try {
  Assert-Exe -Name 'git'
  Assert-Exe -Name 'robocopy'

  if (-not (Test-Path $syncScript)) {
    throw "sync-skills.ps1 not found at: $syncScript"
  }

  # 1) Install git hooks (per-machine; not versioned by git)
  if (-not $SkipGitHooks) {
    $hooksDir = Join-Path $repoRoot '.git\hooks'
    if (-not (Test-Path $hooksDir)) {
      Write-Log "Git hooks directory not found (is this a git repo?): $hooksDir" 'WARN'
    } else {
      $hookBody = @'
#!/bin/sh
# Auto-sync Claude/Gemini skills from this repo. Never fail the git command if syncing fails.

cd "$(git rev-parse --show-toplevel 2>/dev/null)" >/dev/null 2>&1 || exit 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".github/sync-skills.ps1" -NoPull -Quiet >/dev/null 2>&1 || true

exit 0
'@

      foreach ($hookName in @('post-commit', 'post-merge', 'post-checkout')) {
        $hookPath = Join-Path $hooksDir $hookName
        Write-Log "Installing git hook: $hookPath"
        Write-TextFileAscii -Path $hookPath -Content $hookBody
      }
    }
  }

  # 2) Install Windows Startup sync (per-machine)
  if (-not $SkipStartup) {
    $startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
    $startupFile = Join-Path $startupDir 'SyncSkills.vbs'

    $vbs = @'
' Auto-run Codex/Claude/Gemini skills sync at Windows logon (hidden window).
On Error Resume Next

Dim shell, ps1, cmd
Set shell = CreateObject("WScript.Shell")

ps1 = shell.ExpandEnvironmentStrings("%USERPROFILE%\.codex\skills\.github\sync-skills.ps1")
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ -Quiet"

shell.Run cmd, 0, False
'@

    Write-Log "Installing Startup task: $startupFile"
    Write-TextFileAscii -Path $startupFile -Content $vbs -CrLf
  }

  # 3) Initial sync (copy working tree into targets)
  if (-not $SkipInitialSync) {
    Write-Log "Running initial sync to $ClaudeSkillsDir and $GeminiSkillsDir"
    & $syncScript -NoPull -SourceDir $repoRoot -Targets @($ClaudeSkillsDir, $GeminiSkillsDir) | Out-Null
  }

  Write-Log 'Install complete.'
  exit 0
} catch {
  Write-Log $_.Exception.Message 'ERROR'
  exit 1
}

