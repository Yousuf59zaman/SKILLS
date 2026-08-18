param(
    [string]$WorkDir = (Join-Path $env:TEMP 'opencode\mirror-sandbox')
)

$ErrorActionPreference = 'Continue'
$skillScripts = Join-Path $PSScriptRoot '..\scripts'
$setup = (Resolve-Path (Join-Path $skillScripts 'Setup-Mirror.ps1')).Path
$sync = (Resolve-Path (Join-Path $skillScripts 'Sync-Mirror.ps1')).Path

$results = New-Object System.Collections.ArrayList
function Record {
    param([string]$Name, [bool]$Pass, [string]$Note = '')
    [void]$results.Add([pscustomobject]@{ Test = $Name; Pass = $Pass })
    if ($Pass) { Write-Host "PASS  $Name" -ForegroundColor Green }
    else {
        Write-Host "FAIL  $Name" -ForegroundColor Red
        if ($Note) { Write-Host $Note -ForegroundColor DarkYellow }
    }
}

function RefShas {
    param([string]$Remote)
    $map = @{}
    foreach ($line in @(git ls-remote $Remote 2>$null)) {
        $parts = "$line" -split "`t"
        if ($parts.Count -eq 2 -and $parts[1] -notmatch '\^\{\}$' -and ($parts[1] -like 'refs/heads/*' -or $parts[1] -like 'refs/tags/*')) { $map[$parts[1]] = $parts[0] }
    }
    return $map
}
function MapsEqual {
    param($A, $B)
    if ($A.Count -ne $B.Count) { return $false }
    foreach ($k in $A.Keys) { if (-not $B.ContainsKey($k) -or $A[$k] -ne $B[$k]) { return $false } }
    return $true
}

if (Test-Path -LiteralPath $WorkDir) { cmd /c rd /s /q "$WorkDir" 2>&1 | Out-Null }
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

$office = Join-Path $WorkDir 'office.git'
$personal = Join-Path $WorkDir 'personal.git'
$work = Join-Path $WorkDir 'work'
$work2 = Join-Path $WorkDir 'work2'

git init --bare $office 2>&1 | Out-Null
git clone $office $work 2>&1 | Out-Null
git -C $work config user.email 'sandbox@test.local'
git -C $work config user.name 'Sandbox Test'
git -C $work config commit.gpgsign false

Set-Content -LiteralPath (Join-Path $work 'README.md') -Value 'init'
git -C $work add -A | Out-Null
git -C $work commit -m 'c1' | Out-Null
$branch = (git -C $work symbolic-ref --short HEAD | Select-Object -First 1)
git -C $work push -u origin $branch 2>&1 | Out-Null
git -C $work tag v1.0
git -C $work tag -a v1.1 -m 'annotated'
git -C $work checkout -b feature/x 2>&1 | Out-Null
Set-Content -LiteralPath (Join-Path $work 'feature.txt') -Value 'f'
git -C $work add -A | Out-Null
git -C $work commit -m 'f1' | Out-Null
git -C $work push -u origin feature/x 2>&1 | Out-Null
git -C $work checkout $branch 2>&1 | Out-Null

$officeUrlBefore = git -C $work remote get-url origin

$setupOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $setup -RepoPath $work -OfficeRemote origin -Sandbox -SandboxPersonalRemote $personal 2>&1
Record 'setup completes successfully' ($LASTEXITCODE -eq 0) ($setupOut | Out-String)

$officeMap = RefShas $office
$personalMap = RefShas $personal
Record 'initial sync mirrors all branches+tags' (MapsEqual $officeMap $personalMap)
Record 'office remote url unchanged' ((git -C $work remote get-url origin) -eq $officeUrlBefore)
Record 'worktree clean after setup' (@(git -C $work status --porcelain).Count -eq 0)

Set-Content -LiteralPath (Join-Path $work 'README.md') -Value 'b'
git -C $work add -A | Out-Null
git -C $work commit -m 'c2' | Out-Null
$aliasOut = git -C $work chatgpt-sync 2>&1
Record 'git chatgpt-sync alias works' ($LASTEXITCODE -eq 0) ($aliasOut | Out-String)
$officeMap = RefShas $office
$personalMap = RefShas $personal
Record 'new commit reaches office and personal' ((MapsEqual $officeMap $personalMap) -and ($officeMap["refs/heads/$branch"] -eq (git -C $work rev-parse HEAD)))

git -C $work push origin --delete feature/x 2>&1 | Out-Null
git -C $work push origin :refs/tags/v1.0 2>&1 | Out-Null
$syncOut = git -C $work chatgpt-sync 2>&1
$syncExit = $LASTEXITCODE
$personalMap = RefShas $personal
Record 'office deletions pruned from personal' (($syncExit -eq 0) -and -not $personalMap.ContainsKey('refs/heads/feature/x') -and -not $personalMap.ContainsKey('refs/tags/v1.0')) ($syncOut | Out-String)

git -C $work commit --amend -m 'c2-rewritten' | Out-Null
git -C $work push --force origin $branch 2>&1 | Out-Null
$syncOut = git -C $work chatgpt-sync 2>&1
$syncExit = $LASTEXITCODE
$personalMap = RefShas $personal
Record 'office history rewrite force-reconciled' (($syncExit -eq 0) -and ($personalMap["refs/heads/$branch"] -eq (git -C $work rev-parse "refs/heads/$branch"))) ($syncOut | Out-String)

Set-Content -LiteralPath (Join-Path $work 'README.md') -Value 'dirty'
$before = (RefShas $personal)["refs/heads/$branch"]
$syncOut = git -C $work chatgpt-sync 2>&1
$syncExit = $LASTEXITCODE
$after = (RefShas $personal)["refs/heads/$branch"]
Record 'dirty tracked worktree aborts, personal untouched' (($syncExit -ne 0) -and ($before -eq $after)) ($syncOut | Out-String)
git -C $work checkout -- README.md

Set-Content -LiteralPath (Join-Path $work 'notes.txt') -Value 'untracked'
$syncOut = git -C $work chatgpt-sync 2>&1
Record 'untracked-only tree syncs with warning' (($LASTEXITCODE -eq 0) -and ("$syncOut" -match 'untracked')) ($syncOut | Out-String)
[System.IO.File]::Delete((Join-Path $work 'notes.txt'))

git -C $work checkout --detach 2>&1 | Out-Null
$syncOut = git -C $work chatgpt-sync 2>&1
Record 'detached HEAD aborts' ($LASTEXITCODE -ne 0) ($syncOut | Out-String)
git -C $work checkout $branch 2>&1 | Out-Null

$hookPath = Join-Path $office 'hooks\pre-receive'
[System.IO.File]::WriteAllText($hookPath, "#!/bin/sh`nexit 1`n")
Set-Content -LiteralPath (Join-Path $work 'README.md') -Value 'c3'
git -C $work add -A | Out-Null
git -C $work commit -m 'c3' | Out-Null
$before = (RefShas $personal)["refs/heads/$branch"]
$syncOut = git -C $work chatgpt-sync 2>&1
$syncExit = $LASTEXITCODE
$after = (RefShas $personal)["refs/heads/$branch"]
Record 'office push rejection aborts, personal untouched' (($syncExit -ne 0) -and ($before -eq $after) -and ("$syncOut" -match 'OFFICE PUSH FAILED')) ($syncOut | Out-String)
[System.IO.File]::Delete($hookPath)
$syncOut = git -C $work chatgpt-sync 2>&1
Record 'rerun after office fix reconciles' ($LASTEXITCODE -eq 0) ($syncOut | Out-String)

$statusOut = git -C $work chatgpt-sync --status 2>&1
Record 'status clean when in sync' (($LASTEXITCODE -eq 0) -and ("$statusOut" -match 'IN SYNC')) ($statusOut | Out-String)

git clone $office $work2 2>&1 | Out-Null
git -C $work2 config user.email 'sandbox@test.local'
git -C $work2 config user.name 'Sandbox Test'
git -C $work2 config commit.gpgsign false
git -C $work2 checkout -b extra-branch 2>&1 | Out-Null
Set-Content -LiteralPath (Join-Path $work2 'extra.txt') -Value 'x'
git -C $work2 add -A | Out-Null
git -C $work2 commit -m 'x1' | Out-Null
git -C $work2 push -u origin extra-branch 2>&1 | Out-Null
$statusOut = git -C $work chatgpt-sync --status 2>&1
Record 'status flags office-only branch' (($LASTEXITCODE -ne 0) -and ("$statusOut" -match 'only in office')) ($statusOut | Out-String)
$syncOut = git -C $work chatgpt-sync 2>&1
$syncExit = $LASTEXITCODE
$personalMap = RefShas $personal
Record 'sync picks up office-only branch' (($syncExit -eq 0) -and $personalMap.ContainsKey('refs/heads/extra-branch')) ($syncOut | Out-String)

$setupOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $setup -RepoPath $work -Sandbox -SandboxPersonalRemote $personal 2>&1
Record 'setup aborts when already managed' ($LASTEXITCODE -ne 0) ($setupOut | Out-String)
$setupOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $setup -RepoPath $work2 -Sandbox -SandboxPersonalRemote $personal 2>&1
Record 'setup aborts on personal repo collision' (($LASTEXITCODE -ne 0) -and ("$setupOut" -match 'already exists')) ($setupOut | Out-String)

Set-Content -LiteralPath (Join-Path $work2 '.env') -Value 'SECRET=1'
git -C $work2 add -A | Out-Null
git -C $work2 commit -m 'env' | Out-Null
$setupOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $setup -RepoPath $work2 -Sandbox -SandboxPersonalRemote (Join-Path $WorkDir 'personal2.git') 2>&1
Record 'secret audit stops setup' (($LASTEXITCODE -ne 0) -and ("$setupOut" -match 'secrets')) ($setupOut | Out-String)

Write-Host ''
$failed = @($results | Where-Object { -not $_.Pass })
Write-Host ("TOTAL: {0}  PASS: {1}  FAIL: {2}" -f $results.Count, ($results.Count - $failed.Count), $failed.Count)
if ($failed.Count -gt 0) { exit 1 } else { exit 0 }
