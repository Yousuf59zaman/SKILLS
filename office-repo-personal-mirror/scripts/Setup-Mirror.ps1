param(
    [string]$RepoPath = (Get-Location).Path,
    [string]$PersonalAccount,
    [string]$PersonalRepoName,
    [string]$OfficeRemote = 'origin',
    [switch]$AcceptSecretRisk,
    [switch]$Sandbox,
    [string]$SandboxPersonalRemote
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'MirrorCommon.ps1')

function Get-GhAccounts {
    $status = & gh auth status --hostname github.com 2>&1
    $accounts = @()
    $active = $null
    $last = $null
    foreach ($line in @($status)) {
        $text = "$line"
        if ($text -match 'account\s+(\S+)') {
            $last = $Matches[1]
            if ($accounts -notcontains $last) { $accounts += $last }
        }
        if ($text -match 'Active account:\s*true') { $active = $last }
    }
    return @{ Accounts = $accounts; Active = $active }
}

function Invoke-WithGhAccount {
    param(
        [Parameter(Mandatory = $true)][string]$Target,
        [Parameter(Mandatory = $true)][scriptblock]$Body
    )
    $before = (Get-GhAccounts).Active
    if ($before -ne $Target) {
        & gh auth switch --user $Target 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not switch gh active account to '$Target'. Run manually: gh auth switch --user $Target" }
    }
    try {
        & $Body
    }
    finally {
        if ($before -and $before -ne $Target) {
            & gh auth switch --user $before 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-WarnMsg ("Could not restore gh active account '$before'. Run: gh auth switch --user $before") }
            else { Write-Ok ("Restored gh active account: $before") }
        }
    }
}

$exitCode = 0
try {
    if ($Sandbox -and -not $SandboxPersonalRemote) { throw '-Sandbox requires -SandboxPersonalRemote <path-to-bare-repo>.' }

    $RepoPath = [System.IO.Path]::GetFullPath($RepoPath)
    if (-not (Test-Path -LiteralPath $RepoPath)) { throw "RepoPath not found: $RepoPath" }
    Set-Location -LiteralPath $RepoPath
    $repoRoot = Get-RepoRoot
    if (-not $repoRoot) { throw "Not inside a git repository: $RepoPath" }
    Set-Location -LiteralPath $repoRoot

    if (Get-MirrorConfig) { throw 'This repo is already a managed mirror. Use "git chatgpt-sync" (or "git chatgpt-sync --status") instead of setup.' }

    $officeUrl = git remote get-url $OfficeRemote 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $officeUrl) { throw "Office remote '$OfficeRemote' not found in this repo. Pass -OfficeRemote <name> if it is not 'origin'." }

    $repoName = Split-Path $repoRoot -Leaf
    if (-not $PersonalRepoName) { $PersonalRepoName = "chatgpt-mirror-$repoName" }

    Write-Step ("Office source of truth : remote '{0}' = {1}" -f $OfficeRemote, $officeUrl)
    Write-Step ("Planned personal mirror : {0} (private, Actions disabled)" -f $PersonalRepoName)

    $unresolved = git ls-files -u 2>$null
    if ($unresolved) { throw 'Repo has unresolved merge conflicts. Resolve and commit first.' }

    Write-Step 'Auditing tracked files for obvious secrets...'
    $tracked = @(git ls-files)
    $secretPatterns = @(
        '(^|/)\.env(\..*)?$',
        '(^|/)id_(rsa|dsa|ecdsa|ed25519)(\..*)?$',
        '\.(pem|p12|pfx|keystore|htpasswd)$',
        '(^|/)\.?(npmrc|netrc|_netrc)$',
        '(^|/)(credentials?|secrets?)\.(json|ya?ml|txt|ini|env|xml|properties)$'
    )
    $hits = @($tracked | Where-Object {
        $file = $_
        @($secretPatterns | Where-Object { $file -match $_ }).Count -gt 0
    })
    if ($hits.Count -gt 0) {
        Write-WarnMsg 'Suspicious tracked file(s) detected:'
        foreach ($h in $hits) { Write-Host "  $h" -ForegroundColor Yellow }
        if (-not $AcceptSecretRisk) {
            throw 'Setup stopped: possible secrets in tracked files/history. Remove them from tracking (git rm --cached + commit, rotate the secrets) or review, then rerun with -AcceptSecretRisk ONLY after explicit user approval.'
        }
        Write-WarnMsg 'Continuing with -AcceptSecretRisk (explicitly approved).'
    }
    else { Write-Ok 'No obvious secret file names among tracked files.' }

    if (Test-Path (Join-Path $repoRoot '.gitmodules')) {
        Write-WarnMsg 'Git submodules detected. Submodules are NOT mirrored automatically; run this skill inside each authorized submodule repo separately.'
    }

    $lfsOut = git lfs ls-files 2>$null
    if ($LASTEXITCODE -eq 0 -and $lfsOut) {
        Write-WarnMsg ("Git LFS in use ({0} object(s) listed). LFS objects will be transferred during sync." -f @($lfsOut).Count)
    }

    $PersonalRepoFull = $PersonalRepoName
    if ($Sandbox) {
        if (Test-Path -LiteralPath $SandboxPersonalRemote) {
            throw ("Personal destination '{0}' already exists. Not overwriting (collision stop). Choose a different name/path." -f $SandboxPersonalRemote)
        }
        git init --bare $SandboxPersonalRemote 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not create sandbox personal bare repository.' }
        $personalUrl = $SandboxPersonalRemote
        $PersonalAccount = 'sandbox-account'
        Write-WarnMsg 'SANDBOX MODE: GitHub CLI and SSH steps skipped; personal remote is a local bare repo.'
    }
    else {
        if (-not $PersonalAccount) { throw 'Provide -PersonalAccount <your personal GitHub username>.' }
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) not found. Install from https://cli.github.com/ and run: gh auth login' }

        $sshDir = Join-Path $HOME '.ssh'
        New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
        $keyPath = Join-Path $sshDir 'github-personal-mirror'
        if (-not (Test-Path -LiteralPath $keyPath)) {
            Write-Step 'Generating passphrase-protected Ed25519 key (enter a strong passphrase twice when prompted)...'
            & ssh-keygen -t ed25519 -C 'github-personal-mirror' -f $keyPath
            if ($LASTEXITCODE -ne 0) {
                throw ("ssh-keygen failed (non-interactive terminal?). Run manually in a terminal: ssh-keygen -t ed25519 -C github-personal-mirror -f `"{0}`" then rerun setup." -f $keyPath)
            }
        }
        else { Write-Ok 'Existing github-personal-mirror SSH key found; keeping it.' }

        $sshConfig = Join-Path $sshDir 'config'
        $cfgText = ''
        if (Test-Path -LiteralPath $sshConfig) { $cfgText = (Get-Content -LiteralPath $sshConfig -Raw) }
        if ($cfgText -notmatch '(?m)^\s*Host\s+github-personal-mirror(\s|$)') {
            Add-Content -LiteralPath $sshConfig -Value ("`r`nHost github-personal-mirror`r`n    HostName github.com`r`n    User git`r`n    IdentityFile ~/.ssh/github-personal-mirror`r`n    IdentitiesOnly yes`r`n")
            Write-Ok "Appended 'github-personal-mirror' host alias to SSH config (existing config preserved)."
        }

        $svc = Get-Service ssh-agent -ErrorAction SilentlyContinue
        if (-not $svc) { throw 'OpenSSH ssh-agent service not found on this machine.' }
        if ($svc.Status -ne 'Running') {
            try { Start-Service ssh-agent -ErrorAction Stop } catch { }
        }
        if ((Get-Service ssh-agent).Status -ne 'Running') {
            Write-ErrMsg 'ssh-agent is not running and starting it requires elevation.'
            Write-Host 'Run these EXACT commands once in an elevated (Administrator) PowerShell, then rerun setup:' -ForegroundColor Yellow
            Write-Host '  Set-Service ssh-agent -StartupType Automatic' -ForegroundColor Yellow
            Write-Host '  Start-Service ssh-agent' -ForegroundColor Yellow
            throw 'Stopped: refusing to fall back to an unencrypted key.'
        }
        try {
            Set-Service ssh-agent -StartupType Automatic -ErrorAction Stop
        }
        catch {
            Write-WarnMsg 'Could not set ssh-agent to Automatic (needs elevation). Run once in admin PowerShell: Set-Service ssh-agent -StartupType Automatic'
        }
        & ssh-add $keyPath 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-WarnMsg ("ssh-add failed (passphrase prompt needs an interactive terminal?). Run manually: ssh-add `"{0}`"" -f $keyPath)
        }

        $ghInfo = Get-GhAccounts
        if ($ghInfo.Accounts -notcontains $PersonalAccount) {
            throw ("Personal account '{0}' is not logged into gh (current: {1}). Run: gh auth login --hostname github.com (sign in with the PERSONAL account; gh keeps both accounts), then rerun." -f $PersonalAccount, ($ghInfo.Accounts -join ', '))
        }
        Write-Step ("gh active account before setup: '{0}' (will be restored on every path)." -f $ghInfo.Active)

        Invoke-WithGhAccount -Target $PersonalAccount -Body {
            $view = & gh repo view "$PersonalAccount/$PersonalRepoName" 2>$null
            if ($LASTEXITCODE -eq 0) {
                throw ("Personal repo '{0}/{1}' already exists. Not overwriting; choose a different -PersonalRepoName." -f $PersonalAccount, $PersonalRepoName)
            }
            & gh repo create $PersonalRepoName --private 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "gh repo create failed for '$PersonalRepoName'." }
            '{"enabled":false}' | & gh api --method PUT "repos/$PersonalAccount/$PersonalRepoName/actions/permissions" --input - 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Failed to disable GitHub Actions on the personal repo.' }
            Write-Ok ("Created private repo {0}/{1} with Actions disabled." -f $PersonalAccount, $PersonalRepoName)
            $pubKey = "$keyPath.pub"
            if (Test-Path -LiteralPath $pubKey) {
                & gh ssh-key add $pubKey --title "office-mirror-$env:COMPUTERNAME" 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-WarnMsg 'Automatic SSH key upload failed (needs admin:public_key scope). Add this public key manually at https://github.com/settings/keys :'
                    Get-Content -LiteralPath $pubKey | Write-Host
                }
                else { Write-Ok 'Uploaded mirror SSH public key to the personal account.' }
            }
        }

        $testOut = & ssh -o StrictHostKeyChecking=accept-new -T git@github-personal-mirror 2>&1
        if ("$testOut" -notmatch 'Hi ') {
            throw ("SSH test to github-personal-mirror failed: {0}" -f (($testOut | Out-String).Trim()))
        }
        Write-Ok 'SSH connection to github-personal-mirror verified.'

        $personalUrl = "git@github-personal-mirror:$PersonalAccount/$PersonalRepoName.git"
        $PersonalRepoFull = "$PersonalAccount/$PersonalRepoName"
    }

    $existingMirrorUrl = git remote get-url chatgpt-mirror 2>$null
    if ($LASTEXITCODE -eq 0 -and $existingMirrorUrl) {
        throw "Remote 'chatgpt-mirror' already exists in this repo ($existingMirrorUrl). Investigate/remove it consciously before rerunning."
    }
    Invoke-Git @('remote', 'add', 'chatgpt-mirror', $personalUrl)

    Invoke-Git @('config', 'mirror.managed', 'true')
    Invoke-Git @('config', 'mirror.officeRemote', $OfficeRemote)
    Invoke-Git @('config', 'mirror.personalRemote', 'chatgpt-mirror')
    Invoke-Git @('config', 'mirror.personalRepo', $PersonalRepoFull)
    Invoke-Git @('config', 'mirror.personalAccount', $PersonalAccount)
    if ($Sandbox) { Invoke-Git @('config', 'mirror.sandbox', 'true') }

    $syncScript = (Join-Path $PSScriptRoot 'Sync-Mirror.ps1').Replace('\', '/')
    $alias = '!powershell -NoProfile -ExecutionPolicy Bypass -File \"' + $syncScript + '\"'
    Invoke-Git @('config', 'alias.chatgpt-sync', $alias)
    Write-Ok "Added local remote 'chatgpt-mirror' and 'git chatgpt-sync' alias (office remote untouched)."

    $summary = Invoke-MirrorCore -OfficeRemote $OfficeRemote -PersonalRemote 'chatgpt-mirror' -SkipLfs:$Sandbox
    Write-Ok ("Initial mirror sync complete: {0} branch(es), {1} tag(s)." -f $summary.Heads, $summary.Tags)

    if (-not $Sandbox) {
        $defaultBranch = $null
        $showOut = git remote show $OfficeRemote 2>&1
        if ("$showOut" -match 'HEAD branch:\s*(\S+)') { $defaultBranch = $Matches[1] }
        if (-not $defaultBranch) { $defaultBranch = (git symbolic-ref --short HEAD 2>$null | Select-Object -First 1) }
        if ($defaultBranch) {
            Invoke-WithGhAccount -Target $PersonalAccount -Body {
                & gh api --method PATCH "repos/$PersonalAccount/$PersonalRepoName" -f default_branch=$defaultBranch 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { Write-WarnMsg ("Could not set personal default branch to '{0}'." -f $defaultBranch) }
                $json = & gh repo view "$PersonalAccount/$PersonalRepoName" --json visibility 2>$null
                $vis = ($json | ConvertFrom-Json).visibility
                if ($vis -ne 'PRIVATE') { throw "Personal repo visibility is '$vis', expected PRIVATE. Fix immediately: gh repo edit $PersonalAccount/$PersonalRepoName --visibility private" }
                Write-Ok ("Personal repo verified PRIVATE; default branch set to '{0}'." -f $defaultBranch)
            }
        }
        Write-Host ''
        Write-Host ("Personal mirror: https://github.com/{0}" -f $PersonalRepoFull) -ForegroundColor Green
        Write-Host 'Next: in ChatGPT, open the GitHub connector settings and make sure this repo is included in the connector repository access (GitHub App "selected repositories" if applicable).' -ForegroundColor Cyan
    }

    Write-Host ''
    Write-Ok "Setup complete. Daily usage: 'git chatgpt-sync' (push office first, then mirror) and 'git chatgpt-sync --status'."
}
catch {
    Write-ErrMsg "$($_.Exception.Message)"
    $exitCode = 1
}
exit $exitCode
