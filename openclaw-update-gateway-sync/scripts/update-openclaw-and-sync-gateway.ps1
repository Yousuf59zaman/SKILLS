[CmdletBinding()]
param(
    [int]$Port = 18789,
    [switch]$SkipUpdate,
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"

$PreviousOpenClawAuthStoreReadonly = $env:OPENCLAW_AUTH_STORE_READONLY
$env:OPENCLAW_AUTH_STORE_READONLY = "1"
$env:OPENCLAW_CODEX_APP_SERVER_MODE = "yolo"
$env:OPENCLAW_CODEX_APP_SERVER_APPROVAL_POLICY = "never"
$env:OPENCLAW_CODEX_APP_SERVER_SANDBOX = "danger-full-access"

$OpenClawCmd = "openclaw.cmd"
$openclawInfo = Get-Command "openclaw.cmd" -ErrorAction SilentlyContinue
if ($openclawInfo) { $OpenClawCmd = $openclawInfo.Source }

$NpmCmd = "npm.cmd"
$npmInfo = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if ($npmInfo) { $NpmCmd = $npmInfo.Source }

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$IgnoreExitCode
    )

    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $FilePath @Arguments 2>&1
    } finally {
        $ErrorActionPreference = $previousEap
    }
    $exitCode = $LASTEXITCODE

    if (-not $IgnoreExitCode -and $exitCode -ne 0) {
        $joined = $Arguments -join " "
        throw "Command failed ($exitCode): $FilePath $joined`n$output"
    }

    return [PSCustomObject]@{
        ExitCode = $exitCode
        Output   = ($output -join "`n")
    }
}

function Convert-CliJsonOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text,
        [Parameter(Mandatory = $true)]
        [string]$CommandLabel
    )

    $trimmed = $Text.Trim()
    if (-not $trimmed) {
        throw "Command returned empty output: $CommandLabel"
    }

    try {
        return $trimmed | ConvertFrom-Json
    } catch {
        $jsonMatch = [regex]::Match($trimmed, '(?s)\{.*\}')
        if ($jsonMatch.Success) {
            return $jsonMatch.Value | ConvertFrom-Json
        }
        throw "Failed to parse JSON from ${CommandLabel}: $trimmed"
    }
}

function Get-GatewayVersion {
    $gatewayStatusRaw = Invoke-External -FilePath $OpenClawCmd -Arguments @("gateway", "status", "--json")
    $gatewayStatus = Convert-CliJsonOutput -Text $gatewayStatusRaw.Output -CommandLabel "openclaw gateway status --json"
    $version = $gatewayStatus.gateway.version
    if ($version) {
        return [PSCustomObject]@{
            Version = $version
            Status  = $gatewayStatus
            Source  = "gateway.status.gateway.version"
        }
    }

    $candidatePaths = @()
    if ($gatewayStatus.service.command.programArguments) {
        $candidatePaths += @($gatewayStatus.service.command.programArguments)
    }
    if ($gatewayStatus.port.listeners) {
        foreach ($listener in @($gatewayStatus.port.listeners)) {
            if ($listener.commandLine) {
                $candidatePaths += $listener.commandLine
            }
        }
    }

    foreach ($entry in $candidatePaths) {
        if (-not $entry) { continue }

        $match = [regex]::Match($entry, '(?<root>[A-Za-z]:\\[^"]+?\\node_modules\\openclaw)\\dist\\entry\.js')
        if (-not $match.Success) { continue }

        $packageRoot = $match.Groups["root"].Value
        $packageJsonPath = Join-Path $packageRoot "package.json"
        if (-not (Test-Path $packageJsonPath)) { continue }

        $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
        if ($packageJson.version) {
            return [PSCustomObject]@{
                Version = $packageJson.version
                Status  = $gatewayStatus
                Source  = "gateway.status.package_json"
            }
        }
    }

    return [PSCustomObject]@{
        Version = $null
        Status  = $gatewayStatus
        Source  = "unavailable"
    }
}

function Normalize-VersionText {
    param(
        [AllowNull()]
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    $trimmed = $Text.Trim()
    $match = [regex]::Match($trimmed, '\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?')
    if ($match.Success) {
        return $match.Value
    }

    return $trimmed
}

function Get-ListeningPids {
    $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $pids) { return @() }
    return @($pids)
}

function Stop-StaleGatewayProcesses {
    $killed = @()

    foreach ($procId in (Get-ListeningPids)) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            $killed += $procId
        } catch {
            Write-Warning "Failed to stop listener PID ${procId}: $($_.Exception.Message)"
        }
    }

    $extra = Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -eq "node.exe" -and
            $_.CommandLine -match "node_modules\\openclaw\\dist\\index\.js" -and
            $_.CommandLine -match "gateway"
        } |
        Select-Object -ExpandProperty ProcessId -Unique

    foreach ($procId in $extra) {
        if ($killed -contains $procId) { continue }
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            $killed += $procId
        } catch {
            Write-Warning "Failed to stop stale gateway PID ${procId}: $($_.Exception.Message)"
        }
    }

    return @($killed | Select-Object -Unique)
}

function Remove-StaleNpmOpenclawFolders {
    $npmRoot = Join-Path $env:APPDATA "npm\node_modules"
    if (-not (Test-Path $npmRoot)) { return @() }

    $removed = @()
    $staleFolders = Get-ChildItem -Path $npmRoot -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like ".openclaw-*" }

    foreach ($folder in $staleFolders) {
        try {
            Remove-Item -LiteralPath $folder.FullName -Recurse -Force -ErrorAction Stop
            $removed += $folder.FullName
        } catch {
            Write-Warning "Failed to remove stale folder $($folder.FullName): $($_.Exception.Message)"
        }
    }

    return @($removed)
}

function Set-GatewayCodexNoApprovalEnv {
    $openclawHome = Join-Path $env:USERPROFILE ".openclaw"
    $gatewayCmdPath = Join-Path $openclawHome "gateway.cmd"

    if (-not (Test-Path $gatewayCmdPath)) {
        return [PSCustomObject]@{
            Path    = $gatewayCmdPath
            Exists  = $false
            Changed = $false
            Applied = $false
        }
    }

    $requiredLines = @(
        'set "OPENCLAW_CODEX_APP_SERVER_MODE=yolo"',
        'set "OPENCLAW_CODEX_APP_SERVER_APPROVAL_POLICY=never"',
        'set "OPENCLAW_CODEX_APP_SERVER_SANDBOX=danger-full-access"'
    )

    $oldText = Get-Content -LiteralPath $gatewayCmdPath -Raw
    $oldLines = @($oldText -split "\r?\n")
    if ($oldLines.Count -gt 0 -and $oldLines[-1] -eq "") {
        if ($oldLines.Count -eq 1) {
            $oldLines = @()
        } else {
            $oldLines = @($oldLines[0..($oldLines.Count - 2)])
        }
    }

    $filteredLines = @(
        $oldLines | Where-Object {
            $_ -notmatch '^\s*set\s+"?OPENCLAW_CODEX_APP_SERVER_(MODE|APPROVAL_POLICY|SANDBOX)='
        }
    )

    $list = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $filteredLines) {
        $list.Add($line)
    }

    $insertAfterIndex = -1
    for ($i = 0; $i -lt $list.Count; $i++) {
        if ($list[$i] -match '^\s*set\s+"?OPENCLAW_GATEWAY_PORT=') {
            $insertAfterIndex = $i
            break
        }
    }
    if ($insertAfterIndex -lt 0) {
        for ($i = 0; $i -lt $list.Count; $i++) {
            if ($list[$i] -match '^\s*set\s+"?TMPDIR=') {
                $insertAfterIndex = $i
                break
            }
        }
    }

    if ($insertAfterIndex -ge 0) {
        $insertAt = $insertAfterIndex + 1
        foreach ($line in $requiredLines) {
            $list.Insert($insertAt, $line)
            $insertAt++
        }
    } else {
        $insertBeforeIndex = -1
        for ($i = 0; $i -lt $list.Count; $i++) {
            if ($list[$i] -match '^\s*set\s+"?OPENCLAW_SYSTEMD_UNIT=') {
                $insertBeforeIndex = $i
                break
            }
        }

        if ($insertBeforeIndex -ge 0) {
            $insertAt = $insertBeforeIndex
            foreach ($line in $requiredLines) {
                $list.Insert($insertAt, $line)
                $insertAt++
            }
        } else {
            foreach ($line in $requiredLines) {
                $list.Add($line)
            }
        }
    }

    $newText = ($list.ToArray() -join "`r`n") + "`r`n"
    $changed = $newText -ne $oldText
    if ($changed) {
        Set-Content -LiteralPath $gatewayCmdPath -Value $newText -NoNewline
    }

    return [PSCustomObject]@{
        Path    = $gatewayCmdPath
        Exists  = $true
        Changed = $changed
        Applied = $true
    }
}

Write-Host "Collecting current versions..."
$cliBefore = (Invoke-External -FilePath $OpenClawCmd -Arguments @("--version")).Output.Trim()
$gatewayBeforeInfo = Get-GatewayVersion
$gatewayBefore = $gatewayBeforeInfo.Version

Write-Host "Stopping gateway service..."
Invoke-External -FilePath $OpenClawCmd -Arguments @("gateway", "stop") -IgnoreExitCode | Out-Null

Write-Host "Stopping stale gateway processes..."
$killedPids = Stop-StaleGatewayProcesses

Write-Host "Removing stale npm temp folders..."
$removedStaleFolders = Remove-StaleNpmOpenclawFolders

if (-not $SkipUpdate) {
    Write-Host "Updating OpenClaw package..."
    $update = Invoke-External -FilePath $OpenClawCmd -Arguments @("update", "--yes", "--json", "--tag", $Tag) -IgnoreExitCode
    if ($update.ExitCode -ne 0) {
        Write-Host "Primary update failed; retrying with npm.cmd..."
        $npmSpec = if ($Tag -match '^openclaw@') { $Tag } else { "openclaw@$Tag" }
        $npmUpdate = Invoke-External -FilePath $NpmCmd -Arguments @("i", "-g", $npmSpec, "--no-fund", "--no-audit", "--loglevel=error") -IgnoreExitCode
        if ($npmUpdate.ExitCode -ne 0) {
            Write-Host "npm retry failed; retrying with --omit=optional..."
            Invoke-External -FilePath $NpmCmd -Arguments @("i", "-g", $npmSpec, "--omit=optional", "--no-fund", "--no-audit", "--loglevel=error") | Out-Null
        }
    }
}

Write-Host "Ensuring Codex no-approval gateway launcher env..."
$codexLauncherBeforeStart = Set-GatewayCodexNoApprovalEnv

Write-Host "Starting gateway service..."
Invoke-External -FilePath $OpenClawCmd -Arguments @("gateway", "start") | Out-Null

Write-Host "Rechecking Codex no-approval gateway launcher env..."
$codexLauncherAfterStart = Set-GatewayCodexNoApprovalEnv
$restartedForCodexLauncherEnv = $false
if ($codexLauncherAfterStart.Changed) {
    Write-Host "Restarting gateway service to apply Codex no-approval launcher env..."
    Invoke-External -FilePath $OpenClawCmd -Arguments @("gateway", "stop") -IgnoreExitCode | Out-Null
    $killedPids += Stop-StaleGatewayProcesses
    Invoke-External -FilePath $OpenClawCmd -Arguments @("gateway", "start") | Out-Null
    $restartedForCodexLauncherEnv = $true
}

Write-Host "Waiting for gateway health..."
$healthOk = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 750
    $health = Invoke-External -FilePath $OpenClawCmd -Arguments @("gateway", "health", "--json") -IgnoreExitCode
    if ($health.ExitCode -eq 0) {
        $healthObj = Convert-CliJsonOutput -Text $health.Output -CommandLabel "openclaw gateway health --json"
        if ($healthObj.ok -eq $true) {
            $healthOk = $true
            break
        }
    }
}

$cliAfter = (Invoke-External -FilePath $OpenClawCmd -Arguments @("--version")).Output.Trim()
$gatewayAfterInfo = Get-GatewayVersion
$gatewayAfter = $gatewayAfterInfo.Version
$cliBeforeNormalized = Normalize-VersionText -Text $cliBefore
$cliAfterNormalized = Normalize-VersionText -Text $cliAfter
$gatewayBeforeNormalized = Normalize-VersionText -Text $gatewayBefore
$gatewayAfterNormalized = Normalize-VersionText -Text $gatewayAfter
$versionMatch = ($cliAfterNormalized -eq $gatewayAfterNormalized)

$summary = [PSCustomObject]@{
    cli_before          = $cliBefore
    cli_after           = $cliAfter
    cli_before_normalized = $cliBeforeNormalized
    cli_after_normalized = $cliAfterNormalized
    gateway_before      = $gatewayBefore
    gateway_after       = $gatewayAfter
    gateway_before_source = $gatewayBeforeInfo.Source
    gateway_after_source = $gatewayAfterInfo.Source
    gateway_before_normalized = $gatewayBeforeNormalized
    gateway_after_normalized = $gatewayAfterNormalized
    version_match       = $versionMatch
    health_ok           = $healthOk
    killed_listener_pids = @($killedPids)
    removed_stale_folders = @($removedStaleFolders)
    codex_no_approval_launcher_before_start = $codexLauncherBeforeStart
    codex_no_approval_launcher_after_start = $codexLauncherAfterStart
    restarted_for_codex_no_approval_launcher = $restartedForCodexLauncherEnv
    skip_update         = [bool]$SkipUpdate
    update_tag          = $Tag
}

if (-not $healthOk) {
    throw "Gateway health did not return ok after restart. Summary: $($summary | ConvertTo-Json -Depth 5)"
}

if (-not $versionMatch) {
    throw "Gateway app version mismatch after sync. Summary: $($summary | ConvertTo-Json -Depth 5)"
}

$summary | ConvertTo-Json -Depth 5
