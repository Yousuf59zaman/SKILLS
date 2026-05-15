[CmdletBinding()]
param(
    [string]$StateDir = (Join-Path $env:USERPROFILE ".openclaw"),
    [string]$DefaultModel = "codex-cli/gpt-5.3-codex",
    [string]$CronModelAlias = "codex-api",
    [string]$DailyAutomationStartJobId = "13432bb1-de70-477d-8193-849090592a8a",
    [string]$DailyAutomationStartExpr = "4 11 * * *",
    [string]$Timezone = "Asia/Dhaka",
    [switch]$DisableStartNoticeDelivery,
    [switch]$SkipDirectAnnounceTimeoutPatch,
    [switch]$SkipGatewayRestart,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Step([string]$Message) { Write-Host "[step] $Message" -ForegroundColor Cyan }
function Warn([string]$Message) { Write-Host "[warn] $Message" -ForegroundColor Yellow }
function Ok([string]$Message) { Write-Host "[ok] $Message" -ForegroundColor Green }

function Ensure-OpenClawCli {
    try {
        $cmd = Get-Command openclaw -ErrorAction Stop
        Ok "OpenClaw CLI found at $($cmd.Source)"
    } catch {
        throw "OpenClaw CLI is not available in PATH."
    }
}

function Invoke-OpenClaw {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args,
        [switch]$Capture,
        [switch]$ReadOnly
    )

    $display = "openclaw --no-color {0}" -f ($Args -join " ")
    if ($DryRun -and -not $ReadOnly) {
        Write-Host "[dry-run] $display" -ForegroundColor DarkYellow
        if ($Capture) { return "" }
        return $null
    }

    if ($Capture) {
        $output = & openclaw --no-color @Args 2>&1
        if ($LASTEXITCODE -ne 0) {
            $text = ($output | Out-String).Trim()
            throw "Command failed ($LASTEXITCODE): $display`n$text"
        }
        return ($output | Out-String)
    }

    & openclaw --no-color @Args | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $display"
    }
    return $null
}

function Get-OpenClawJson {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $raw = Invoke-OpenClaw -Args $Args -Capture -ReadOnly
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    try {
        return ($raw | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        throw "Failed to parse JSON for: openclaw --no-color $($Args -join ' ')"
    }
}

function Get-AgentTurnJobs {
    param(
        [Parameter(Mandatory = $false)]
        [object]$CronList
    )

    if ($null -eq $CronList -or $null -eq $CronList.jobs) { return @() }
    return @($CronList.jobs | Where-Object { $_.payload -and $_.payload.kind -eq "agentTurn" })
}

function Restart-WatchdogProcess {
    param(
        [string]$WatchdogPath
    )

    if (-not (Test-Path -LiteralPath $WatchdogPath)) {
        Warn "Watchdog script not found at $WatchdogPath; skipping watchdog restart."
        return
    }

    try {
        $procMatches = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                ($_.Name -eq "powershell.exe" -or $_.Name -eq "pwsh.exe") -and
                $_.CommandLine -and
                ($_.CommandLine -match "OpenClaw-Watchdog\.ps1")
            }
        foreach ($p in $procMatches) {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Warn "Unable to stop existing watchdog processes cleanly: $($_.Exception.Message)"
    }

    try {
        Start-Process -FilePath "powershell.exe" -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", $WatchdogPath
        ) -WindowStyle Hidden | Out-Null
        Ok "Watchdog restarted."
    } catch {
        Warn "Failed to restart watchdog: $($_.Exception.Message)"
    }
}

function Patch-DirectAnnounceTimeouts {
    param(
        [string]$DistPath
    )

    $result = [pscustomobject]@{
        scanned = 0
        patched = 0
        lineEdits = 0
    }

    if (-not (Test-Path -LiteralPath $DistPath)) {
        Warn "OpenClaw dist directory not found: $DistPath"
        return $result
    }

    $files = Get-ChildItem -Path $DistPath -Recurse -File -Filter "*.js" -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -like "reply-*.js" -or
        $_.Name -like "pi-embedded-*.js" -or
        $_.Name -like "subagent-registry-*.js"
    }

    foreach ($file in $files) {
        $result.scanned++
        $lines = Get-Content -Path $file.FullName
        if (-not ($lines -match "Subagent completion direct announce failed")) { continue }

        $anchors = New-Object System.Collections.Generic.List[int]
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "Subagent completion direct announce failed") {
                $anchors.Add($i)
            }
        }
        if ($anchors.Count -eq 0) { continue }

        $changed = $false
        foreach ($anchor in $anchors) {
            $start = [Math]::Max(0, $anchor - 350)
            $end = [Math]::Max(0, $anchor - 1)
            for ($idx = $start; $idx -le $end; $idx++) {
                if ($lines[$idx] -match "timeoutMs:\\s*15e3") {
                    $lines[$idx] = $lines[$idx] -replace "timeoutMs:\\s*15e3", "timeoutMs: 45e3"
                    $result.lineEdits++
                    $changed = $true
                }
            }
        }

        if ($changed) {
            $result.patched++
            if (-not $DryRun) {
                Copy-Item -Path $file.FullName -Destination ($file.FullName + ".bak-codex") -Force
                Set-Content -Path $file.FullName -Value $lines -Encoding utf8
            }
        }
    }

    return $result
}

function Get-WatchdogSignals {
    param(
        [string]$WatchdogPath
    )

    if (-not (Test-Path -LiteralPath $WatchdogPath)) {
        return [pscustomobject]@{
            exists = $false
            hasDeliveryOnlyGuard = $false
            hasDeliverySkip = $false
            hasFailureFallback = $false
            fallbackAliasCodex = $false
        }
    }

    $raw = Get-Content -Path $WatchdogPath -Raw
    return [pscustomobject]@{
        exists = $true
        hasDeliveryOnlyGuard = ($raw -match "function Test-IsDeliveryOnlyCronError")
        hasDeliverySkip = ($raw -match 'Test-IsDeliveryOnlyCronError -LastError \\$lastError')
        hasFailureFallback = ($raw -match "function Invoke-CronFailureCodexRetry")
        fallbackAliasCodex = ($raw -match '\\$CronFallbackModelAlias = "codex"')
    }
}

Ensure-OpenClawCli

$watchdogPath = Join-Path $StateDir "OpenClaw-Watchdog.ps1"
$distPath = Join-Path $env:APPDATA "npm\node_modules\openclaw\dist"

Step "Loading current cron jobs"
$cronBefore = Get-OpenClawJson -Args @("cron", "list", "--json")
$jobsBefore = @(Get-AgentTurnJobs -CronList $cronBefore)

Step "Enforcing global default route = codex-cli"
Invoke-OpenClaw -Args @("models", "set", $DefaultModel)
Invoke-OpenClaw -Args @("config", "set", "agents.defaults.model.fallbacks", "[]")

Step "Enforcing codex exec resume stdin safety"
Invoke-OpenClaw -Args @("config", "set", "agents.defaults.cliBackends.codex-cli.input", "stdin")
Invoke-OpenClaw -Args @("config", "set", "agents.defaults.cliBackends.codex-cli.maxPromptArgChars", "1")

Step "Enforcing cron exception policy (cron jobs use codex-api)"
$modelUpdatedCount = 0
foreach ($job in $jobsBefore) {
    $jobId = ""
    try { $jobId = [string]$job.id } catch { $jobId = "" }
    if ([string]::IsNullOrWhiteSpace($jobId)) { continue }

    $jobModel = ""
    try {
        if ($null -ne $job.payload -and $null -ne $job.payload.model) {
            $jobModel = [string]$job.payload.model
        }
    } catch {
        $jobModel = ""
    }

    if (-not [string]::Equals($jobModel, $CronModelAlias, [System.StringComparison]::OrdinalIgnoreCase)) {
        Invoke-OpenClaw -Args @("cron", "edit", $jobId, "--model", $CronModelAlias, "--json")
        $modelUpdatedCount++
    }
}

Step "Enforcing Daily Automation Start schedule = 11:04 Asia/Dhaka"
$dailyStart = $null
if ($cronBefore -and $cronBefore.jobs) {
    $dailyStart = @($cronBefore.jobs | Where-Object { [string]$_.id -eq $DailyAutomationStartJobId } | Select-Object -First 1)
    if (-not $dailyStart) {
        $dailyStart = @($cronBefore.jobs | Where-Object { [string]$_.name -eq "Daily Automation Start" } | Select-Object -First 1)
    }
}
if ($dailyStart) {
    $currentExpr = ""
    $currentTz = ""
    try { $currentExpr = [string]$dailyStart.schedule.expr } catch {}
    try { $currentTz = [string]$dailyStart.schedule.tz } catch {}

    if ($currentExpr -ne $DailyAutomationStartExpr -or $currentTz -ne $Timezone) {
        Invoke-OpenClaw -Args @("cron", "edit", [string]$dailyStart.id, "--cron", $DailyAutomationStartExpr, "--tz", $Timezone, "--exact", "--json")
        Ok "Daily Automation Start schedule updated."
    } else {
        Ok "Daily Automation Start schedule already correct."
    }
} else {
    Warn "Daily Automation Start job was not found; skipped schedule update."
}

Step "Enforcing guard jobs as no-deliver (noise-free recovery)"
$guardUpdatedCount = 0
if ($cronBefore -and $cronBefore.jobs) {
    $guardJobs = @($cronBefore.jobs | Where-Object { [string]$_.name -like "Daily Automation Guard*" })
    foreach ($job in $guardJobs) {
        $mode = ""
        try { $mode = [string]$job.delivery.mode } catch {}
        if (-not [string]::Equals($mode, "none", [System.StringComparison]::OrdinalIgnoreCase)) {
            Invoke-OpenClaw -Args @("cron", "edit", [string]$job.id, "--no-deliver", "--json")
            $guardUpdatedCount++
        }
    }
}

$startNoticeUpdatedCount = 0
if ($DisableStartNoticeDelivery) {
    Step "Disabling delivery for start-notice jobs (optional hardening)"
    if ($cronBefore -and $cronBefore.jobs) {
        $noticeJobs = @($cronBefore.jobs | Where-Object { [string]$_.name -like "Start Notice -*" })
        foreach ($job in $noticeJobs) {
            $mode = ""
            try { $mode = [string]$job.delivery.mode } catch {}
            if (-not [string]::Equals($mode, "none", [System.StringComparison]::OrdinalIgnoreCase)) {
                Invoke-OpenClaw -Args @("cron", "edit", [string]$job.id, "--no-deliver", "--json")
                $startNoticeUpdatedCount++
            }
        }
    }
}

$timeoutPatch = [pscustomobject]@{ scanned = 0; patched = 0; lineEdits = 0 }
if (-not $SkipDirectAnnounceTimeoutPatch) {
    Step "Patching direct announce timeout window (15s -> 45s) in runtime bundles"
    $timeoutPatch = Patch-DirectAnnounceTimeouts -DistPath $distPath
    Ok ("Runtime timeout patch scan complete (scanned={0}, patched={1}, lineEdits={2})." -f $timeoutPatch.scanned, $timeoutPatch.patched, $timeoutPatch.lineEdits)
} else {
    Warn "Skipping runtime direct-announce timeout patch by request."
}

if (-not $SkipGatewayRestart) {
    Step "Restarting OpenClaw gateway"
    Invoke-OpenClaw -Args @("gateway", "restart")
    if (-not $DryRun) {
        Restart-WatchdogProcess -WatchdogPath $watchdogPath
    }
} else {
    Warn "Skipping gateway/watchdog restart by request."
}

Step "Verifying routing + cron policy"
$modelStatus = Get-OpenClawJson -Args @("models", "status", "--json")
$cronAfter = Get-OpenClawJson -Args @("cron", "list", "--json")
$jobsAfter = @(Get-AgentTurnJobs -CronList $cronAfter)
$badCronModels = @($jobsAfter | Where-Object {
    $m = ""
    try { $m = [string]$_.payload.model } catch {}
    -not [string]::Equals($m, $CronModelAlias, [System.StringComparison]::OrdinalIgnoreCase)
})
$dailyAfter = $null
if ($cronAfter -and $cronAfter.jobs) {
    $dailyAfter = @($cronAfter.jobs | Where-Object { [string]$_.id -eq $DailyAutomationStartJobId } | Select-Object -First 1)
}
$dailyExprAfter = ""
$dailyTzAfter = ""
if ($dailyAfter) {
    try { $dailyExprAfter = [string]$dailyAfter.schedule.expr } catch {}
    try { $dailyTzAfter = [string]$dailyAfter.schedule.tz } catch {}
}

$watchdog = Get-WatchdogSignals -WatchdogPath $watchdogPath

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host ("defaultModel resolved: {0}" -f $modelStatus.resolvedDefault)
Write-Host ("cron model updated count: {0}" -f $modelUpdatedCount)
Write-Host ("guard no-deliver updated count: {0}" -f $guardUpdatedCount)
Write-Host ("start-notice no-deliver updated count: {0}" -f $startNoticeUpdatedCount)
Write-Host ("Daily Automation Start schedule: expr='{0}' tz='{1}'" -f $dailyExprAfter, $dailyTzAfter)
Write-Host ("agentTurn cron jobs not using '{0}': {1}" -f $CronModelAlias, $badCronModels.Count)
Write-Host ("watchdog: exists={0} deliveryOnlyGuard={1} deliverySkip={2} failureFallback={3} fallbackAliasCodex={4}" -f `
    $watchdog.exists, $watchdog.hasDeliveryOnlyGuard, $watchdog.hasDeliverySkip, $watchdog.hasFailureFallback, $watchdog.fallbackAliasCodex)

if ($badCronModels.Count -gt 0) {
    $names = @($badCronModels | ForEach-Object {
        $n = ""
        try { $n = [string]$_.name } catch { $n = "" }
        if ([string]::IsNullOrWhiteSpace($n)) { $n = [string]$_.id }
        $n
    })
    Warn ("Jobs still not using {0}: {1}" -f $CronModelAlias, ($names -join ", "))
}

if (-not [string]::Equals([string]$modelStatus.resolvedDefault, $DefaultModel, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved default model mismatch. Expected '$DefaultModel', got '$($modelStatus.resolvedDefault)'."
}
if ($dailyAfter -and ($dailyExprAfter -ne $DailyAutomationStartExpr -or $dailyTzAfter -ne $Timezone)) {
    throw "Daily Automation Start schedule mismatch after apply. Expected '$DailyAutomationStartExpr'/$Timezone, got '$dailyExprAfter'/$dailyTzAfter."
}
if ($badCronModels.Count -gt 0) {
    throw "One or more cron jobs are not pinned to '$CronModelAlias'."
}

Ok "Cron exception hardening complete."
