param(
    [string]$RepoPath = (Get-Location).Path,
    [switch]$Status,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RestArgs
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'MirrorCommon.ps1')

$exitCode = 0
try {
    if (@($RestArgs | Where-Object { "$_" -in @('--status', '-Status', 'status') }).Count -gt 0) { $Status = $true }

    $RepoPath = [System.IO.Path]::GetFullPath($RepoPath)
    if (-not (Test-Path -LiteralPath $RepoPath)) { throw "RepoPath not found: $RepoPath" }
    Set-Location -LiteralPath $RepoPath
    $repoRoot = Get-RepoRoot
    if (-not $repoRoot) { throw "Not inside a git repository: $RepoPath" }
    Set-Location -LiteralPath $repoRoot

    $cfg = Get-MirrorConfig
    if (-not $cfg) { throw 'This repo is not a managed mirror. Run Setup-Mirror.ps1 (office-repo-personal-mirror skill) once first.' }

    if (Test-Path (Join-Path $repoRoot '.gitmodules')) {
        Write-WarnMsg 'Submodules detected: they are NOT mirrored automatically. Register each one separately with this skill.'
    }

    if ($Status) {
        Write-Step 'Read-only status check (ls-remote on both remotes; no writes)...'
        $officeMap = Get-RemoteRefMap $cfg.OfficeRemote
        $personalMap = Get-RemoteRefMap $cfg.PersonalRemote
        $diff = Compare-RefMaps -OfficeMap $officeMap -PersonalMap $personalMap
        if ($diff.Count -eq 0) {
            Write-Ok ("IN SYNC: {0} branch(es), {1} tag(s) identical on office and personal." -f @($officeMap.Keys | Where-Object { $_ -like 'refs/heads/*' }).Count, @($officeMap.Keys | Where-Object { $_ -like 'refs/tags/*' }).Count)
        }
        else {
            Write-WarnMsg ("OUT OF SYNC ({0} difference(s)):" -f $diff.Count)
            foreach ($d in $diff) { Write-Host "  $d" -ForegroundColor Yellow }
            $exitCode = 1
        }
    }
    else {
        Write-Step 'Safety checks (worktree, HEAD, merge/rebase state)...'
        Assert-SafeWorktree -RepoRoot $repoRoot

        $branch = (git symbolic-ref --short HEAD | Select-Object -First 1)
        Write-Step ("Step 1/2: pushing current branch '{0}' to office remote '{1}' (non-force)..." -f $branch, $cfg.OfficeRemote)
        $pushOut = git push $cfg.OfficeRemote $branch 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw ("OFFICE PUSH FAILED - personal mirror left untouched. Fix the office push and rerun. Details:`n{0}" -f (($pushOut | Out-String).Trim()))
        }
        Write-Ok 'Office push complete.'

        Write-Step 'Step 2/2: reconciling personal mirror (force + prune towards personal only)...'
        $summary = Invoke-MirrorCore -OfficeRemote $cfg.OfficeRemote -PersonalRemote $cfg.PersonalRemote -SkipLfs:$cfg.Sandbox
        Write-Ok ("Personal mirror updated: {0} branch(es), {1} tag(s)." -f $summary.Heads, $summary.Tags)

        $officeMap = Get-RemoteRefMap $cfg.OfficeRemote
        $personalMap = Get-RemoteRefMap $cfg.PersonalRemote
        $diff = Compare-RefMaps -OfficeMap $officeMap -PersonalMap $personalMap
        if ($diff.Count -gt 0) {
            Write-WarnMsg ("Mirror still diverged ({0} difference(s)); rerun 'git chatgpt-sync' to reconcile:" -f $diff.Count)
            foreach ($d in $diff) { Write-Host "  $d" -ForegroundColor Yellow }
            $exitCode = 1
        }
        else {
            Write-Ok ("Verified: office and personal are in sync ({0} branch(es), {1} tag(s))." -f $summary.Heads, $summary.Tags)
        }
    }
}
catch {
    Write-ErrMsg "$($_.Exception.Message)"
    $exitCode = 1
}
exit $exitCode
