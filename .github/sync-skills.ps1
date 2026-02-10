[CmdletBinding()]
param(
  # Source skills directory (this is the "truth" that gets copied into Targets).
  # Default: the parent of this script's folder (i.e., ...\.codex\skills)
  [string]$SourceDir = '',

  # If SourceDir is a git repo, attempt a fast-forward-only pull before syncing.
  # Use -NoPull to disable (useful for git hooks).
  [switch]$NoPull,

  # Remote URL (only used when cloning/initializing a repo).
  [string]$RepoUrl = 'https://github.com/Yousuf59zaman/SKILLS',

  # Where to copy skills to after pulling
  [string[]]$Targets = @(
    "$env:USERPROFILE\.claude\skills",
    "$env:USERPROFILE\.gemini\antigravity\skills"
  ),

  # If set, remove files/dirs in destination that were deleted in the repo
  [switch]$Mirror,

  # If set, also copy top-level folders that aren't skills (no SKILL.md)
  [switch]$IncludeNonSkillDirs,

  # If set, don't copy *.skill packages from repo root
  [switch]$SkipSkillPackages,

  # If set, minimize console output (still logs to file)
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SourceDir)) {
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $SourceDir = (Split-Path -Parent $PSScriptRoot)
  } elseif (-not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    $SourceDir = (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
  } else {
    throw 'Unable to infer SourceDir. Pass -SourceDir explicitly.'
  }
}

function Get-LogFilePath {
  $logDir = Join-Path $env:USERPROFILE '.codex\log'
  New-Item -ItemType Directory -Force $logDir | Out-Null
  return (Join-Path $logDir 'skills-sync.log')
}

$script:LogFile = Get-LogFilePath

function Write-Log {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
  )

  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[$ts][$Level] $Message"

  try {
    Add-Content -Path $script:LogFile -Value $line -Encoding UTF8
  } catch {
    # If logging fails, don't block syncing.
  }

  if (-not $Quiet) {
    Write-Host $line
  }
}

function Assert-Exe {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required executable not found on PATH: $Name"
  }
}

function Test-IsGitRepo {
  param([Parameter(Mandatory = $true)][string]$Dir)
  try {
    & git -C $Dir rev-parse --is-inside-work-tree 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Sync-Dir {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Dest
  )

  $copyMode = @('/E')
  if ($Mirror) {
    $copyMode = @('/MIR')
  }

  # robocopy exit codes are a bitmask: 0-7 are considered success.
  & robocopy $Source $Dest @copyMode `
    '/R:2' '/W:2' `
    '/COPY:DAT' '/DCOPY:DAT' `
    '/NFL' '/NDL' '/NJH' '/NJS' '/NP' `
    '/XD' '.git' | Out-Null

  $rc = $LASTEXITCODE
  if ($rc -gt 7) {
    throw "robocopy failed ($rc) syncing '$Source' -> '$Dest'"
  }
}

try {
  Assert-Exe -Name 'git'
  Assert-Exe -Name 'robocopy'

  $sourcePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourceDir)
  if (-not (Test-Path $sourcePath)) {
    throw "SourceDir does not exist: $sourcePath"
  }

  # 1) Optionally pull latest (fast-forward only) if this looks like a git repo.
  if (-not $NoPull -and (Test-IsGitRepo -Dir $sourcePath)) {
    Write-Log "Attempting git pull --ff-only in $sourcePath"
    & git -C $sourcePath pull --ff-only | Out-Null
    if ($LASTEXITCODE -ne 0) {
      # Don't fail the whole sync: local changes/commits may prevent ff-only pulls.
      Write-Log "git pull --ff-only failed (continuing). If you have local commits or conflicts, pull manually." 'WARN'
    }
  }

  # 2) Decide what to sync
  $sourceDirs = Get-ChildItem -Directory -Force $sourcePath | Where-Object { $_.Name -ne '.git' }
  if (-not $IncludeNonSkillDirs) {
    $sourceDirs = $sourceDirs | Where-Object {
      $_.Name -eq '.system' -or
      (Test-Path (Join-Path $_.FullName 'SKILL.md')) -or
      (Test-Path (Join-Path $_.FullName 'skill.md'))
    }
  }

  $skillPackages = @()
  if (-not $SkipSkillPackages) {
    $skillPackages = @(Get-ChildItem -File -Force $sourcePath -Filter '*.skill' -ErrorAction SilentlyContinue)
  }

  # 3) Sync to each target root
  foreach ($target in $Targets) {
    if ([string]::IsNullOrWhiteSpace($target)) { continue }

    $targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($target)
    if ($targetPath.TrimEnd('\') -ieq $sourcePath.TrimEnd('\')) {
      continue
    }
    New-Item -ItemType Directory -Force $targetPath | Out-Null

    Write-Log "Syncing into $targetPath"

    foreach ($dir in $sourceDirs) {
      $destDir = Join-Path $targetPath $dir.Name
      Write-Log "  Dir: $($dir.Name)"
      Sync-Dir -Source $dir.FullName -Dest $destDir
    }

    foreach ($pkg in $skillPackages) {
      $destFile = Join-Path $targetPath $pkg.Name
      Write-Log "  File: $($pkg.Name)"
      Copy-Item -Force -LiteralPath $pkg.FullName -Destination $destFile
    }
  }

  Write-Log 'Sync complete.'
  exit 0
} catch {
  Write-Log $_.Exception.Message 'ERROR'
  exit 1
}
