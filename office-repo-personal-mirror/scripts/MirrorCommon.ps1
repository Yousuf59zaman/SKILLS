# Shared helpers for the office-repo-personal-mirror skill. PowerShell 5.1 compatible.

function Write-Step { param([string]$Message) Write-Host "[mirror] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[mirror] OK: $Message" -ForegroundColor Green }
function Write-WarnMsg { param([string]$Message) Write-Host "[mirror] WARNING: $Message" -ForegroundColor Yellow }
function Write-ErrMsg { param([string]$Message) Write-Host "[mirror] ERROR: $Message" -ForegroundColor Red }

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure
    )
    $output = & git @Arguments 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) {
        throw ("git {0} failed (exit {1}): {2}" -f ($Arguments -join ' '), $code, (($output | Out-String).Trim()))
    }
    return $output
}

function Get-GitConfigValue {
    param([Parameter(Mandatory = $true)][string]$Key)
    $value = git config --get $Key 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($value | Select-Object -First 1)
}

function Get-RepoRoot {
    $root = git rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $root) { return $null }
    return ($root | Select-Object -First 1)
}

function Get-MirrorConfig {
    $managed = Get-GitConfigValue 'mirror.managed'
    if ($managed -ne 'true') { return $null }
    return @{
        OfficeRemote    = (Get-GitConfigValue 'mirror.officeRemote')
        PersonalRemote  = (Get-MirrorConfigValueOrDefault 'mirror.personalRemote' 'chatgpt-mirror')
        PersonalRepo    = (Get-GitConfigValue 'mirror.personalRepo')
        PersonalAccount = (Get-GitConfigValue 'mirror.personalAccount')
        Sandbox         = ((Get-GitConfigValue 'mirror.sandbox') -eq 'true')
    }
}

function Get-MirrorConfigValueOrDefault {
    param([string]$Key, [string]$Default)
    $value = Get-GitConfigValue $Key
    if (-not $value) { return $Default }
    return $value
}

function Assert-SafeWorktree {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)
    $gitDir = (Invoke-Git @('rev-parse', '--absolute-git-dir') | Select-Object -First 1)
    $unresolved = git ls-files -u 2>$null
    if ($unresolved) { throw 'Unresolved merge conflicts exist. Resolve and commit them, then rerun.' }
    foreach ($marker in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD')) {
        if (Test-Path (Join-Path $gitDir $marker)) { throw "In-progress $marker state detected. Finish or abort it, then rerun." }
    }
    if ((Test-Path (Join-Path $gitDir 'rebase-merge')) -or (Test-Path (Join-Path $gitDir 'rebase-apply'))) {
        throw 'A rebase is in progress. Finish or abort it, then rerun.'
    }
    git symbolic-ref -q HEAD *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Detached HEAD detected. Check out a branch, then rerun.' }
    $dirty = git status --porcelain --untracked-files=no 2>$null
    if ($dirty) {
        throw ("Worktree has uncommitted changes to tracked files. Commit or stash them first, then rerun.`n{0}" -f (($dirty | Out-String).Trim()))
    }
    $untracked = @(git status --porcelain 2>$null | Where-Object { $_ -like '?? *' })
    if ($untracked.Count -gt 0) {
        Write-WarnMsg ("{0} untracked file(s) present. They are NOT synced (only committed history is mirrored)." -f $untracked.Count)
    }
}

function Get-RemoteRefMap {
    param([Parameter(Mandatory = $true)][string]$Remote)
    $map = @{}
    $lines = git ls-remote $Remote 2>&1
    if ($LASTEXITCODE -ne 0) { throw ("git ls-remote {0} failed: {1}" -f $Remote, (($lines | Out-String).Trim())) }
    foreach ($line in @($lines)) {
        $parts = "$line" -split "`t"
        if ($parts.Count -ne 2) { continue }
        $ref = $parts[1]
        if ($ref -match '\^\{\}$') { continue }
        if ($ref -like 'refs/heads/*' -or $ref -like 'refs/tags/*') { $map[$ref] = $parts[0] }
    }
    return $map
}

function Compare-RefMaps {
    param(
        [Parameter(Mandatory = $true)]$OfficeMap,
        [Parameter(Mandatory = $true)]$PersonalMap
    )
    $diff = @()
    foreach ($key in $OfficeMap.Keys) {
        if (-not $PersonalMap.ContainsKey($key)) {
            $diff += "only in office: $key"
        }
        elseif ($OfficeMap[$key] -ne $PersonalMap[$key]) {
            $diff += ("diverged: {0} (office {1} vs personal {2})" -f $key, $OfficeMap[$key].Substring(0, 7), $PersonalMap[$key].Substring(0, 7))
        }
    }
    foreach ($key in $PersonalMap.Keys) {
        if (-not $OfficeMap.ContainsKey($key)) { $diff += "only in personal: $key" }
    }
    return ,$diff
}

function Clear-OfficeTempRefs {
    $refs = @(git for-each-ref --format='%(refname)' refs/mirror-office 2>$null)
    foreach ($ref in $refs) { git update-ref -d $ref 2>$null | Out-Null }
}

function Invoke-MirrorCore {
    param(
        [Parameter(Mandatory = $true)][string]$OfficeRemote,
        [Parameter(Mandatory = $true)][string]$PersonalRemote,
        [switch]$SkipLfs
    )
    Clear-OfficeTempRefs
    Write-Step 'Fetching all office branches/tags into temporary refs...'
    $fetchOut = git fetch --no-tags $OfficeRemote '+refs/heads/*:refs/mirror-office/heads/*' '+refs/tags/*:refs/mirror-office/tags/*' 2>&1
    if ($LASTEXITCODE -ne 0) {
        Clear-OfficeTempRefs
        throw ("Fetching office remote '{0}' failed: {1}" -f $OfficeRemote, (($fetchOut | Out-String).Trim()))
    }

    $lfsActive = $false
    $lfsOut = git lfs ls-files 2>$null
    if ($LASTEXITCODE -eq 0 -and $lfsOut) { $lfsActive = $true }
    if ($lfsActive -and -not $SkipLfs) {
        Write-Step 'Git LFS objects detected; transferring LFS objects first...'
        $lf = git lfs fetch --all $OfficeRemote 2>&1
        if ($LASTEXITCODE -ne 0) { Write-WarnMsg ("LFS fetch failed (continuing): {0}" -f (($lf | Out-String).Trim())) }
        $lp = git lfs push --all $PersonalRemote 2>&1
        if ($LASTEXITCODE -ne 0) { Write-WarnMsg ("LFS push failed; rerun 'git chatgpt-sync' later: {0}" -f (($lp | Out-String).Trim())) }
    }

    Write-Step 'Force-reconciling personal mirror (branches + tags, prune stale; personal only)...'
    $pushOut = git push --force --prune $PersonalRemote '+refs/mirror-office/heads/*:refs/heads/*' '+refs/mirror-office/tags/*:refs/tags/*' 2>&1
    $pushOk = ($LASTEXITCODE -eq 0)
    $pushText = ($pushOut | Out-String).Trim()
    Clear-OfficeTempRefs
    if (-not $pushOk) {
        throw ("PERSONAL MIRROR PUSH FAILED (office push already completed; mirror may be partially updated). Fix the cause and rerun 'git chatgpt-sync' to reconcile. Details:`n{0}" -f $pushText)
    }
    $map = Get-RemoteRefMap $PersonalRemote
    $heads = @($map.Keys | Where-Object { $_ -like 'refs/heads/*' }).Count
    $tags = @($map.Keys | Where-Object { $_ -like 'refs/tags/*' }).Count
    return @{ Heads = $heads; Tags = $tags }
}
