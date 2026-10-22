[CmdletBinding()]
param(
    [string]$BridgeDir = (Join-Path $env:USERPROFILE '.paseo\codex-shared-bridge'),
    [ValidateRange(10, 3600)]
    [int]$StatusMaxAgeSeconds = 60
)

# Read-only diagnostics. Never serialize settings, URLs with credentials,
# raw errors, private records, process identifiers, titles, or transcripts.
$ErrorActionPreference = 'Stop'
$warnings = [Collections.Generic.List[string]]::new()
$bridgePath = [IO.Path]::GetFullPath($BridgeDir)

function Read-LocalJson([string]$FilePath) {
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { return $null }
    try {
        return (Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json
    } catch { return $null }
}

function Test-LocalPath([string]$FilePath) {
    return (-not [string]::IsNullOrWhiteSpace($FilePath)) -and (Test-Path -LiteralPath $FilePath)
}

function Get-AgeSeconds($Timestamp) {
    try {
        $moment = if ($Timestamp -is [DateTime] -or $Timestamp -is [DateTimeOffset]) {
            [DateTimeOffset]$Timestamp
        } else {
            [DateTimeOffset]::Parse([string]$Timestamp, [Globalization.CultureInfo]::InvariantCulture)
        }
        return [Math]::Round(([DateTimeOffset]::UtcNow - $moment).TotalSeconds, 1)
    } catch { return $null }
}

function Test-CodeMarker([string]$FilePath, [string[]]$Markers) {
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { return $null }
    try {
        $text = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
        foreach ($marker in $Markers) { if (-not $text.Contains($marker)) { return $false } }
        return $true
    } catch { return $null }
}

function Get-TaskSummary([string]$TaskName, [string]$ExpectedScript, [string]$ArgumentsSuffix = '') {
    $result = [ordered]@{ present = $null; enabled = $null; running = $null; actionMatches = $null }
    try {
        $scheduler = New-Object -ComObject Schedule.Service
        $scheduler.Connect()
        $folder = $scheduler.GetFolder('\')
        try { $task = $folder.GetTask($TaskName) }
        catch {
            if ($_.Exception.HResult -in @(-2147024894, -2147024893)) {
                $result.present = $false
            }
            return [pscustomobject]$result
        }
        $result.present = $true
        $result.enabled = [bool]$task.Enabled
        $result.running = ($task.State -eq 4)
        $action = $task.Definition.Actions.Item(1)
        $expectedExecutable = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $expectedArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ExpectedScript + '"'
        if ($TaskName -eq 'PaseoCodexSharedBackendStartup') { $expectedArguments += ' -KeepAlive' }
        $expectedArguments += $ArgumentsSuffix
        $legacyMatch = ($action.Path -eq $expectedExecutable -and $action.Arguments -eq $expectedArguments)
        $result.actionMatches = $legacyMatch
        if ($TaskName -eq 'PaseoCodexSendRollout') {
            $launcherExe = Join-Path (Split-Path -Parent $ExpectedScript) 'SendSyncLauncher.exe'
            $launcherMatch = ($action.Path -ceq $launcherExe -and ([string]$action.Arguments -eq '') -and $action.WorkingDirectory -ceq (Split-Path -Parent $ExpectedScript))
            if ($launcherMatch) { $result.actionMatches = $true }
        }
        if ($TaskName -eq 'PaseoCodexCanonicalHistory') {
            $launcherExe = Join-Path (Split-Path -Parent $ExpectedScript) 'CanonicalHistoryLauncher.exe'
            $launcherMatch = ($action.Path -ceq $launcherExe -and ([string]$action.Arguments -eq '') -and $action.WorkingDirectory -ceq (Split-Path -Parent $ExpectedScript) -and [int]$task.Definition.Actions.Count -eq 1 -and [int]$action.Type -eq 0)
            if ($launcherMatch) { $result.actionMatches = $true }
        }
    } catch { }
    return [pscustomobject]$result
}

$settings = Read-LocalJson (Join-Path $bridgePath 'settings.json')
$catalog = Read-LocalJson (Join-Path $bridgePath 'catalog-status.json')
$savedLive = Read-LocalJson (Join-Path $bridgePath 'status.json')
$gateway = $null
try {
    $candidate = Invoke-RestMethod -Uri 'http://127.0.0.1:19458/status' -TimeoutSec 3
    if ($candidate.integration -eq 'paseo-codex-shared-1') { $gateway = $candidate }
    else { $warnings.Add('The status listener is not the expected shared integration.') }
} catch { $warnings.Add('The local shared status listener could not be read.') }

$catalogAge = $null
if ($catalog.updatedAt) {
    try {
        # PowerShell 7 may deserialize ISO Z timestamps as UTC DateTime values.
        # Parsing their culture-formatted string again would lose the timezone.
        $catalogTimestamp = if ($catalog.updatedAt -is [DateTime] -or $catalog.updatedAt -is [DateTimeOffset]) {
            [DateTimeOffset]$catalog.updatedAt
        } else {
            [DateTimeOffset]::Parse([string]$catalog.updatedAt, [Globalization.CultureInfo]::InvariantCulture)
        }
        $catalogAge = [Math]::Round(([DateTimeOffset]::UtcNow - $catalogTimestamp).TotalSeconds, 1)
    }
    catch { $warnings.Add('The catalog timestamp could not be interpreted.') }
}
$fresh = ($null -ne $catalogAge -and $catalogAge -ge -5 -and $catalogAge -le $StatusMaxAgeSeconds)
$ready = ($null -ne $gateway -and $gateway.backend.state -eq 'ready')
$desktopInitialized = ($null -ne $gateway -and [int]$gateway.initialized.desktop -gt 0)
$paseoInitialized = ($null -ne $gateway -and [int]$gateway.initialized.paseo -gt 0)
$generationMatches = ($null -ne $gateway -and $null -ne $catalog.backendGeneration -and $catalog.backendGeneration -eq $gateway.backend.generation)
$countsAvailable = ($null -ne $catalog.chats -and $null -ne $catalog.verifiedChats -and $null -ne $catalog.duplicates)
$countsMatch = ($countsAvailable -and $catalog.verifiedChats -eq $catalog.chats -and $catalog.duplicates -eq 0)
$catalogHealthy = ($catalog.status -eq 'active' -and $fresh -and $ready -and $desktopInitialized -and $generationMatches -and $countsMatch)

$requiredFiles = @('catalog-sync.mjs', 'catalog-recents.mjs', 'catalog-hook.mjs', 'install-catalog-hook.mjs', 'catalog-daemon.mjs', 'daemon-status.mjs', 'Start-Catalog.ps1', 'Install-Catalog.ps1', 'Catalog-WatchLib.ps1', 'service.mjs', 'gateway.mjs', 'stdio-bridge.mjs', 'shared-stdio-transport.mjs', 'async-question-sync.mjs', 'install-question-sync.mjs', 'Update-QuestionSync-WhenIdle.ps1', 'Install-QuestionRollout.ps1', 'rpc.mjs', 'history-recovery.mjs', 'history-utils.mjs', 'check-paseo-idle.mjs', 'Start-HistoryRecovery.ps1', 'Install-HistoryRecovery.ps1', 'Ensure-Backend.ps1', 'Backend-Control.ps1', 'Backend-SupervisorLib.ps1', 'Backend-RecoveryPulse.ps1', 'Install-RecoveryPulse.ps1', 'backend-lifecycle.mjs', 'account-idle.mjs', 'check-account-idle.mjs', 'Restart-Idle-Backend.ps1')
$missingFiles = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $bridgePath $_) -PathType Leaf) })
$catalogEnabled = Test-Path -LiteralPath (Join-Path $bridgePath 'catalog-enabled.json') -PathType Leaf
$routingEnabled = Test-Path -LiteralPath (Join-Path $bridgePath 'routing-enabled.json') -PathType Leaf
$catalogTask = Get-TaskSummary 'PaseoCodexProjectCatalog' (Join-Path $bridgePath 'Start-Catalog.ps1')
$backendTask = Get-TaskSummary 'PaseoCodexSharedBackendStartup' (Join-Path $bridgePath 'Ensure-Backend.ps1')

$workerRunning = $null
$worker = Read-LocalJson (Join-Path $bridgePath 'catalog-worker.private.json')
if ($worker.pid) {
    try {
        $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$worker.pid)
        $workerRunning = ($null -ne $process -and $process.Name -in @('powershell.exe','pwsh.exe') -and $process.CommandLine.Contains((Join-Path $bridgePath 'Start-Catalog.ps1')))
    } catch { }
}

$hookImport = $null
$hookPayload = $null
$questionMarkers = $null
$sendMarkers = $null
$sendSessionMarkers = $null
$questionSync = $null
$paseoCliVersion = $null
$codexCliVersion = $null
$providerUsesBridge = $null
$providerEnabled = $null
$files = [ordered]@{ bridgeExists = (Test-Path -LiteralPath $bridgePath -PathType Container); settingsReadable = ($null -ne $settings); missingHelpers = $missingFiles; nativeExists = $null; nodeExists = $null; cliRootExists = $null; tokenConfigured = $null; tokenFilePresent = $null }
if ($settings) {
    $files.nativeExists = Test-LocalPath $settings.native
    $files.nodeExists = Test-LocalPath $settings.node
    $files.cliRootExists = Test-LocalPath $settings.cliRoot
    $files.tokenConfigured = -not [string]::IsNullOrWhiteSpace([string]$settings.transportToken)
    $files.tokenFilePresent = Test-Path -LiteralPath (Join-Path $bridgePath 'transport-token.private') -PathType Leaf
    if (-not [string]::IsNullOrWhiteSpace($settings.cliRoot)) {
        $package = Read-LocalJson (Join-Path $settings.cliRoot 'package.json')
        $paseoCliVersion = $package.version
        $npmModules = Split-Path -Parent (Split-Path -Parent $settings.cliRoot)
        $codexPackage = Read-LocalJson (Join-Path $npmModules '@openai\codex\package.json')
        $codexCliVersion = $codexPackage.version
        $packageRoot = Join-Path $settings.cliRoot 'node_modules\@getpaseo\server\dist\server\server'
        $hookImport = Test-CodeMarker (Join-Path $packageRoot 'agent\import-sessions.js') @('paseo-codex-catalog-v1', 'importCatalogHandle', 'catalog-hook.mjs')
        $hookPayload = Test-CodeMarker (Join-Path $packageRoot 'session.js') @('paseo-codex-catalog-v1', 'catalogStoredRecord', 'buildStoredAgentPayload')
        $questionMarkers = Test-CodeMarker (Join-Path $packageRoot 'agent\providers\codex-app-server-agent.js') @('paseo-codex-questions-v1', 'reconcileExternalAnswer', 'reconcileCanonicalAnswer', 'preResolveIfAnswered', 'reconcileSavedQuestions', 'ackProviderBuild', 'isQuestionResolved')
        $sendMarkers = Test-CodeMarker (Join-Path $packageRoot 'agent\providers\codex-app-server-agent.js') @('paseo-codex-send-v1', 'ackSendBuild', 'admitNativeSendForStart', 'classifyNativeThreadStatus', 'isDefinitiveCodexStartRejection')
        $sendSessionMarkers = Test-CodeMarker (Join-Path $packageRoot 'session.js') @('paseo-codex-send-v1', 'createSendBudget', 'raceWithBudget', 'messageReceipts.sendGuarded')
    }
    if (-not [string]::IsNullOrWhiteSpace($settings.paseoHome)) {
        $config = Read-LocalJson (Join-Path $settings.paseoHome 'config.json')
        if ($config.agents.providers.codex) {
            $providerEnabled = ($config.agents.providers.codex.enabled -ne $false)
            $commandText = (@($config.agents.providers.codex.command) -join ' ').Replace('\', '/').ToLowerInvariant()
            $adapterPath = (Join-Path $bridgePath 'stdio-bridge.mjs').Replace('\', '/').ToLowerInvariant()
            $providerUsesBridge = $commandText.Contains($adapterPath)
        }
    }
}

$desktopRouteMatches = $null
try {
    $desktopRoute = [Environment]::GetEnvironmentVariable('CODEX_APP_SERVER_WS_URL', 'User')
    if ([string]::IsNullOrWhiteSpace($desktopRoute)) { $desktopRouteMatches = $false }
    else {
        $parsedRoute = [Uri]$desktopRoute
        $desktopRouteMatches = ($parsedRoute.Scheme -eq 'ws' -and $parsedRoute.Host -eq '127.0.0.1' -and $parsedRoute.Port -eq 19458 -and $parsedRoute.AbsolutePath -eq '/desktop')
    }
} catch { }

# Aggregate-only adapter/recovery inspection. Heartbeat records contain original
# session handles and process identifiers, so only counts and freshness leave
# this script: never handles, titles, transcripts, pids, raw errors, or the
# raw contents of any status field. Version alone never proves the reviewed
# source: the expected build signature is recomputed from the same files the
# adapter hashes at spawn, and only matching records count as current.
$expectedBuild = $null
try {
    $transportBytes = [IO.File]::ReadAllBytes((Join-Path $bridgePath 'shared-stdio-transport.mjs'))
    $bridgeBytes = [IO.File]::ReadAllBytes((Join-Path $bridgePath 'stdio-bridge.mjs'))
    $questionBytes = [IO.File]::ReadAllBytes((Join-Path $bridgePath 'async-question-sync.mjs'))
    $sha = [Security.Cryptography.SHA256]::Create()
    $expectedBuild = (($sha.ComputeHash($transportBytes + $bridgeBytes + $questionBytes) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
} catch { }
$adapterHealth = [ordered]@{ records = 0; freshCurrentBuild = 0; freshOlderBuild = 0; freshUnsubscribed = 0; reconnectingAdapters = 0; pendingHistory = 0; exhaustedHistory = 0; suppressedDeltas = 0; stale = 0; subscribedChats = 0; expectedBuild = ($null -ne $expectedBuild) }
$healthDir = Join-Path $bridgePath 'adapter-health.private'
if (Test-Path -LiteralPath $healthDir -PathType Container) {
    foreach ($file in (Get-ChildItem -LiteralPath $healthDir -Filter '*.json' -ErrorAction SilentlyContinue)) {
        $record = Read-LocalJson $file.FullName
        if ($null -eq $record) { $adapterHealth.stale++; continue }
        $adapterHealth.records++
        $age = Get-AgeSeconds $record.updatedAt
        $alive = $false
        try { if ([int]$record.pid -gt 0) { $alive = ($null -ne (Get-Process -Id ([int]$record.pid) -ErrorAction Stop)) } } catch { }
        $subscribed = @($record.subscriptions).Count
        if ($null -ne $age -and $age -ge -5 -and $age -le 30 -and $alive -and $record.state -ne 'closed') {
            if ($subscribed -eq 0) { $adapterHealth.freshUnsubscribed++ }
            elseif ([string]$record.state -ne 'ready') { $adapterHealth.reconnectingAdapters++ }
            else {
                $adapterHealth.subscribedChats += $subscribed
                $gap = [int]$record.incompleteHistory
                $exhausted = [int]$record.exhaustedHistory
                $adapterHealth.suppressedDeltas += [int]$record.suppressedDeltas
                if ($exhausted -gt 0) { $adapterHealth.exhaustedHistory += $exhausted; $adapterHealth.pendingHistory += $gap }
                elseif ($gap -gt 0) { $adapterHealth.pendingHistory += $gap }
                elseif ($null -ne $expectedBuild -and [int]$record.version -ge 4 -and [string]$record.build -eq $expectedBuild) { $adapterHealth.freshCurrentBuild++ }
                else { $adapterHealth.freshOlderBuild++ }
            }
        } else { $adapterHealth.stale++ }
    }
}

$recovery = [ordered]@{ status = $null; ageSeconds = $null; fresh = $false; checked = $null; upgraded = $null; deferredBusy = $null; deferredReconnect = $null; healthy = $null; pendingHistory = $null; exhaustedGaps = $null; gapRecovered = $null; unresolvedGaps = $null; quarantined = $null; failed = $null; unvisited = $null; enumerationIncomplete = $null; ownershipLost = $null; errorStage = $null; errorKind = $null }
$recoveryFile = Read-LocalJson (Join-Path $bridgePath 'history-recovery-status.json')
if ($recoveryFile) {
    $recovery.status = [string]$recoveryFile.status
    $recovery.ageSeconds = Get-AgeSeconds $recoveryFile.updatedAt
    $recovery.fresh = ($null -ne $recovery.ageSeconds -and $recovery.ageSeconds -ge -5 -and $recovery.ageSeconds -le 90)
    $recovery.checked = $recoveryFile.checked
    $recovery.upgraded = $recoveryFile.upgraded
    $recovery.deferredBusy = $recoveryFile.deferredBusy
    $recovery.deferredReconnect = $recoveryFile.deferredReconnect
    $recovery.healthy = $recoveryFile.healthy
    $recovery.pendingHistory = $recoveryFile.pendingHistory
    $recovery.exhaustedGaps = $recoveryFile.exhaustedGaps
    $recovery.gapRecovered = $recoveryFile.gapRecovered
    $recovery.unresolvedGaps = $recoveryFile.unresolvedGaps
    $recovery.quarantined = $recoveryFile.quarantined
    $recovery.failed = $recoveryFile.failed
    $recovery.unvisited = $recoveryFile.unvisited
    $recovery.enumerationIncomplete = $recoveryFile.enumerationIncomplete
    $recovery.ownershipLost = $recoveryFile.ownershipLost
    # Only whitelisted stage/kind labels are reported; raw messages are never
    # persisted by the worker and must never be reconstructed here.
    $recovery.errorStage = [string]$recoveryFile.errorStage
    $recovery.errorKind = [string]$recoveryFile.errorKind
}
# Count only: duplicate watch workers race each other with stale-schema passes.
# Task restarts orphan node children, so more than one here needs cleanup of
# the exact stale processes (never a broad kill).
$recoveryWorkers = $null
try { $recoveryWorkers = @((Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop) | Where-Object { $_.CommandLine -like '*history-recovery.mjs*' }).Count } catch { }
$recoveryTask = Get-TaskSummary 'PaseoCodexHistoryRecovery' (Join-Path $bridgePath 'Start-HistoryRecovery.ps1')
$questionRolloutTask = Get-TaskSummary 'PaseoCodexQuestionRollout' (Join-Path $bridgePath 'Update-QuestionSync-WhenIdle.ps1') ' -MaxWaitSeconds 120'
$questionSync = Read-LocalJson (Join-Path $bridgePath 'question-sync-status.json')
$questionSyncFresh = $false
if ($questionSync) {
    $questionSyncAge = Get-AgeSeconds $questionSync.updatedAt
    $questionSyncFresh = ($null -ne $questionSyncAge -and $questionSyncAge -ge -5 -and $questionSyncAge -le 300)
}
$questionRollout = Read-LocalJson (Join-Path $bridgePath 'question-rollout.json')
$canonicalTask = Get-TaskSummary 'PaseoCodexCanonicalHistory' (Join-Path $bridgePath 'Update-CanonicalHistory-WhenIdle.ps1')
$canonicalStatus = Read-LocalJson (Join-Path $bridgePath 'canonical-history-status.json')
$canonicalRollout = Read-LocalJson (Join-Path $bridgePath 'canonical-history-rollout.json')
$canonicalVerify = Read-LocalJson (Join-Path $bridgePath 'canonical-history-verify.json')
$canonicalOwner = Read-LocalJson (Join-Path $bridgePath 'history-recovery-owner.private.json')
# Canonical activation truth (never an old ACK as active): installed +
# pendingRollout clear + daemon/worker/send proofs + the live owner claim
# naming the CURRENT worker source with a live process (exact actor
# identity, not heartbeat age). No process identifiers leave this script.
$canonical = [ordered]@{ installed = $null; pendingRollout = $null; daemonPart = $null; workerLiveCurrent = $null; generationFresh = $null; sendTargetExact = $null; ownerSourceMatches = $null; ownerProcessAlive = $null; active = $false }
$currentWorkerToken = $null
try {
    $currentWorkerToken = ((Get-FileHash -LiteralPath (Join-Path $bridgePath 'history-recovery.mjs') -Algorithm SHA256).Hash).ToLowerInvariant().Substring(0, 16)
} catch { }
if ($canonicalStatus) {
    $canonical.installed = ($canonicalStatus.installed -eq $true)
    $canonical.pendingRollout = [bool]$canonicalStatus.pendingRollout
    if ($canonicalStatus.ack) {
        $canonical.daemonPart = [bool]$canonicalStatus.ack.daemonPart
        $canonical.workerLiveCurrent = [bool]$canonicalStatus.ack.workerLiveCurrent
        $canonical.generationFresh = [bool]$canonicalStatus.ack.generationFresh
        $canonical.sendTargetExact = [bool]$canonicalStatus.ack.sendTargetExact
    }
}
if ($canonicalOwner -and $null -ne $currentWorkerToken) {
    $canonical.ownerSourceMatches = ([string]$canonicalOwner.source -eq [string]$currentWorkerToken)
    try {
        if ([int]$canonicalOwner.pid -gt 0) {
            $ownerProc = Get-Process -Id ([int]$canonicalOwner.pid) -ErrorAction Stop
            $canonical.ownerProcessAlive = (-not $ownerProc.HasExited)
        } else { $canonical.ownerProcessAlive = $false }
    } catch { $canonical.ownerProcessAlive = $false }
}
$canonical.active = ([bool]$canonical.installed -and -not [bool]$canonical.pendingRollout -and [bool]$canonical.daemonPart -and [bool]$canonical.workerLiveCurrent -and [bool]$canonical.ownerSourceMatches -and [bool]$canonical.ownerProcessAlive)
$canonical.statusAgeSeconds = Get-AgeSeconds $canonicalStatus.updatedAt
# Selected original history: only an executable verified record counts.
# queued/mismatch/pending (incl. the known close-barrier failure) is never
# green; absent UI proof is never fabricated into a passed UI test.
$selectedHistory = [ordered]@{ status = $null; verified = $false; ageSeconds = $null }
if ($canonicalVerify) {
    $selectedHistory.status = [string]$canonicalVerify.status
    $selectedHistory.verified = ([string]$canonicalVerify.status -eq 'verified')
    $selectedHistory.ageSeconds = Get-AgeSeconds $canonicalVerify.updatedAt
}
$sendRolloutTask = Get-TaskSummary 'PaseoCodexSendRollout' (Join-Path $bridgePath 'Update-SendSync-WhenIdle.ps1') ' -MaxWaitSeconds 120'
$sendSync = Read-LocalJson (Join-Path $bridgePath 'send-sync-status.json')
$sendSyncFresh = $false
if ($sendSync) {
    $sendSyncAge = Get-AgeSeconds $sendSync.updatedAt
    $sendSyncFresh = ($null -ne $sendSyncAge -and $sendSyncAge -ge -5 -and $sendSyncAge -le 300)
}
$sendRollout = Read-LocalJson (Join-Path $bridgePath 'send-rollout.json')

if (-not $fresh) { $warnings.Add('The catalog snapshot is missing or stale.') }
if (-not $generationMatches) { $warnings.Add('The catalog has not been verified against the current backend generation.') }
if (-not $catalogEnabled) { $warnings.Add('The catalog enabled marker is absent.') }
if ($catalogTask.present -eq $false -or $catalogTask.enabled -eq $false -or $catalogTask.actionMatches -eq $false) { $warnings.Add('The catalog logon task needs inspection.') }
if ($hookImport -ne $true -or $hookPayload -ne $true) { $warnings.Add('The installed package hook markers are missing, unreadable, or incomplete.') }
if ($questionMarkers -ne $true) { $warnings.Add('The installed async-question sync patch markers are missing, unreadable, or incomplete.') }
if ($questionSync.installed -ne $true) { $warnings.Add('The async-question sync patch is not installed.') }
if ($questionSync.pendingRollout -eq $true) { $warnings.Add('The async-question sync patch awaits a guarded idle daemon reload to take effect.') }
if ($questionRollout.status -eq 'needs_attention') { $warnings.Add('The async-question rollout needs attention; the daemon was left running.') }
if ($questionRolloutTask.present -eq $false -or $questionRolloutTask.actionMatches -eq $false) { $warnings.Add('The async-question rollout retry task is missing or points at a foreign action; reinstall it disabled via Install-QuestionRollout.ps1.') }
if ($sendSync -and $sendSync.installed -ne $true) { $warnings.Add('The send-timeout sync patch is not installed.') }
if ($sendMarkers -ne $true -or $sendSessionMarkers -ne $true) { $warnings.Add('The installed send-timeout sync patch markers are missing, unreadable, or incomplete.') }
if ($sendSync.pendingRollout -eq $true) { $warnings.Add('The send-timeout sync patch awaits a guarded idle daemon reload to take effect.') }
if ($sendRollout.status -eq 'needs_attention') { $warnings.Add('The send-timeout rollout needs attention; the daemon was left running.') }
if ($sendRolloutTask.present -eq $false -or $sendRolloutTask.actionMatches -eq $false) { $warnings.Add('The send-timeout rollout retry task is missing or points at a foreign action.') }
if ($recoveryTask.present -eq $false -or $recoveryTask.enabled -eq $false -or $recoveryTask.actionMatches -eq $false) { $warnings.Add('The history recovery logon task needs inspection.') }
if (-not $recovery.fresh) { $warnings.Add('The history recovery status is missing or stale; the watch worker may have exited.') }
$supervisorState = Read-LocalJson (Join-Path $bridgePath 'backend-supervisor.private.json')
if ($supervisorState) {
    $supervisorAge = Get-AgeSeconds $supervisorState.updatedAt
    if ($null -eq $supervisorAge -or $supervisorAge -lt -5 -or $supervisorAge -gt 300) { $warnings.Add('The backend supervisor state is missing or stale; the monitor loop may have exited.') }
    elseif ([string]$supervisorState.mode -eq 'needs_attention') { $warnings.Add('The backend supervisor reports needs_attention; inspect its note.') }
} else { $warnings.Add('The backend supervisor has not published state yet.') }
if ([int]$recovery.failed -gt 0) { $warnings.Add('The history recovery worker reports failed sessions.') }
if ([int]$recovery.unvisited -gt 0 -or $recovery.enumerationIncomplete -eq $true) { $warnings.Add('The history recovery worker could not visit every session within its pass budget.') }
if ([int]$recovery.unresolvedGaps -gt 0) { $warnings.Add('A history gap exhausted bounded recovery and needs attention; it is not waiting normally.') }
if ([int]$recovery.quarantined -gt 0) { $warnings.Add('A refresh of unknown outcome awaits safe re-observation; no follow-up mutation is issued meanwhile.') }
if ([int]$recovery.pendingHistory -gt 0 -or [int]$adapterHealth.pendingHistory -gt 0) { $warnings.Add('One or more adapters report an unresolved history gap; those chats are pending, not healthy.') }
if ($recoveryWorkers -ne $null -and [int]$recoveryWorkers -ne 1) { $warnings.Add('The history recovery worker count is not exactly one; duplicate workers race with stale passes.') }
if ($canonicalTask.present -eq $false -or $canonicalTask.enabled -eq $false -or $canonicalTask.actionMatches -eq $false) { $warnings.Add('The canonical history actor task needs inspection.') }
$preUpgradeWarningCount = $warnings.Count
if ($canonical.pendingRollout -eq $true) { $warnings.Add('Canonical history activation is pending a guarded idle rollout; a verified reachable pending upgrade, not active.') }
elseif (-not $canonical.active) { $warnings.Add('Canonical history activation is not fully verified (proofs, owner identity, or target mismatch); never an old ACK as active.') }
if (-not $selectedHistory.verified) { $warnings.Add('The selected original history is not verified (pending, mismatch, or the known unresolved live failure); absent UI proof is not a passed test.') }
if ($paseoInitialized -and $adapterHealth.freshCurrentBuild -eq 0 -and $adapterHealth.freshOlderBuild -eq 0) { $warnings.Add('No fresh ready adapter heartbeat was found for the initialized Paseo connection.') }
if ($providerUsesBridge -ne $true) { $warnings.Add('The configured Codex provider adapter could not be verified.') }
if ($workerRunning -eq $false) { $warnings.Add('The recorded catalog worker is not running from this bridge.') }

$supportVerified = ($missingFiles.Count -eq 0 -and $files.settingsReadable -and $files.nativeExists -eq $true -and $files.nodeExists -eq $true -and $files.cliRootExists -eq $true -and $files.tokenConfigured -eq $true -and $files.tokenFilePresent -eq $true -and $hookImport -eq $true -and $hookPayload -eq $true -and $questionMarkers -eq $true -and $providerUsesBridge -eq $true -and $providerEnabled -eq $true -and $catalogEnabled -and $workerRunning -eq $true -and $catalogTask.present -eq $true -and $catalogTask.enabled -eq $true -and $catalogTask.running -eq $true -and $catalogTask.actionMatches -eq $true)
# History recovery is REQUIRED for live-history health: a stale status file or
# a missing/duplicate watch worker must never report green overall readiness.
# Catalog sync health stays separately true in catalogHealthy.
$recoveryWatchHealthy = ([bool]$recovery.fresh -and $null -ne $recoveryWorkers -and [int]$recoveryWorkers -eq 1 -and $recoveryTask.present -eq $true -and $recoveryTask.enabled -eq $true -and $recoveryTask.actionMatches -eq $true)
if ($catalogHealthy -and $supportVerified -and -not $recoveryWatchHealthy) { $warnings.Add('History recovery is required but its watch worker is stale, missing, or duplicated; catalog sync stays healthy separately.') }
$foundationsOk = ($catalogHealthy -and $supportVerified -and $recoveryWatchHealthy)
$blockingWarnings = ($preUpgradeWarningCount -gt 0)
$readiness = 'needs_attention'
if (-not $files.bridgeExists) { $readiness = 'bridge_missing' }
elseif ($foundationsOk -and $canonical.active -and $selectedHistory.verified) { $readiness = 'ready' }
elseif ($foundationsOk -and -not $blockingWarnings) { $readiness = 'pending_activation' }
elseif ($catalog.status -eq 'waiting_for_Desktop') { $readiness = 'waiting_for_Desktop' }

# FLAT-LAYOUT scoped assessment (minimal addition; global readiness above unchanged).
# Aggregate-only: no mapping IDs, cwds, or workspace lists leave this script.
# Authoritative roster: mapping.flatUnits (frozen original unit list, count>0
# required); each rec.flat pair cross-checked against
# mapping.projects[rec.nativePid].flat[normalized rec.backingCwd].
$flatFlagOn = $false
try {
    $flatFlagDoc = Read-LocalJson (Join-Path $bridgePath 'catalog-flat-workspaces.json')
    $flatFlagOn = ($null -ne $flatFlagDoc -and [bool]$flatFlagDoc.enabled -eq $true)
} catch { $flatFlagOn = $false }
$flatMappingDoc = Read-LocalJson (Join-Path $bridgePath 'catalog-map.private.json')
$flatRosterUnits = 0
$flatMatchedUnits = 0
$flatMembershipProblems = 0
$flatRegistryReadable = $false
$flatUmbrellaAbsent = $null
$flatStatusUnits = $null
try { if ($null -ne $catalog) { $flatStatusUnits = $catalog.flatUnits } } catch { $flatStatusUnits = $null }
try {
    if ($flatFlagOn -and $null -ne $flatMappingDoc -and $null -ne $flatMappingDoc.flatUnits) {
        $liveProjectsFlat = $null
        $liveWorkspacesFlat = $null
        try {
            if ($null -ne $settings -and -not [string]::IsNullOrWhiteSpace([string]$settings.paseoHome)) {
                $pjRaw = Get-Content -LiteralPath (Join-Path ([string]$settings.paseoHome) 'projects/projects.json') -Raw -Encoding UTF8
                $wsRaw = Get-Content -LiteralPath (Join-Path ([string]$settings.paseoHome) 'projects/workspaces.json') -Raw -Encoding UTF8
                $pjJson = $pjRaw.TrimStart([char]0xFEFF) | ConvertFrom-Json
                $wsJson = $wsRaw.TrimStart([char]0xFEFF) | ConvertFrom-Json
                if ($pjJson -is [array]) { $liveProjectsFlat = $pjJson }
                elseif ($null -ne $pjJson.entries -and ($pjJson.entries -is [array])) { $liveProjectsFlat = $pjJson.entries }
                elseif ($null -ne $pjJson.projects -and ($pjJson.projects -is [array])) { $liveProjectsFlat = $pjJson.projects }
                elseif ($null -ne $pjJson) { $liveProjectsFlat = @($pjJson) }
                if ($wsJson -is [array]) { $liveWorkspacesFlat = $wsJson }
                elseif ($null -ne $wsJson.entries -and ($wsJson.entries -is [array])) { $liveWorkspacesFlat = $wsJson.entries }
                elseif ($null -ne $wsJson.workspaces -and ($wsJson.workspaces -is [array])) { $liveWorkspacesFlat = $wsJson.workspaces }
                elseif ($null -ne $wsJson) { $liveWorkspacesFlat = @($wsJson) }
                $flatRegistryReadable = (($null -ne $liveProjectsFlat) -and ($null -ne $liveWorkspacesFlat))
            }
        } catch { $flatRegistryReadable = $false }
        if ($flatRegistryReadable) {
            foreach ($rp in $flatMappingDoc.flatUnits.PSObject.Properties) {
                $rec = $rp.Value
                if ($null -eq $rec -or [string]$rec.backingCwd -eq '' -or [string]$rec.nativePid -eq '') { $flatMembershipProblems++; continue }
                $flatRosterUnits++
                $pair = $rec.flat
                if ($null -eq $pair -or [string]$pair.projectId -eq '' -or [string]$pair.workspaceId -eq '') { $flatMembershipProblems++; continue }
                $xpair = $null
                try {
                    $backingKey = (([string]$rec.backingCwd -replace '\\','/').ToLowerInvariant())
                    $projEntry = $flatMappingDoc.projects."$($rec.nativePid)"
                    if ($null -ne $projEntry -and $null -ne $projEntry.flat) { $xpair = $projEntry.flat."$backingKey" }
                } catch { $xpair = $null }
                if ($null -eq $xpair -or [string]$xpair.projectId -cne [string]$pair.projectId -or [string]$xpair.workspaceId -cne [string]$pair.workspaceId) { $flatMembershipProblems++; continue }
                $fp = @($liveProjectsFlat | Where-Object { [string]$_.projectId -ceq [string]$pair.projectId -and -not [bool]$_.archivedAt })
                $fw = @($liveWorkspacesFlat | Where-Object { ([string]$_.workspaceId -ceq [string]$pair.workspaceId -or [string]$_.id -ceq [string]$pair.workspaceId) -and -not [bool]$_.archivedAt })
                if ($fp.Count -eq 1 -and $fw.Count -eq 1 -and [string]$fw[0].projectId -ceq [string]$pair.projectId) { $flatMatchedUnits++ }
                else { $flatMembershipProblems++ }
            }
            try {
                $cidFlat = ''
                try { $cidFlat = [string]$flatMappingDoc.containerProjectId } catch { }
                $codexRootNorm = ((Join-Path $bridgePath 'Codex') -replace '\\','/').ToLowerInvariant()
                $hitsFlat = @($liveProjectsFlat | Where-Object {
                    (-not [bool]$_.archivedAt) -and (
                        (([string]$_.projectId -ceq $cidFlat) -and $cidFlat -ne '') -or
                        (([string]$_.projectRootPath -replace '\\','/').ToLowerInvariant() -ceq $codexRootNorm -and [string]$_.projectRootPath -ne '') -or
                        (([string]$_.rootPath -replace '\\','/').ToLowerInvariant() -ceq $codexRootNorm -and [string]$_.rootPath -ne '')
                    )
                })
                $flatUmbrellaAbsent = ($hitsFlat.Count -eq 0)
            } catch { $flatUmbrellaAbsent = $null }
        }
    }
} catch { $flatRegistryReadable = $false }
$flatStatusOk = ($flatFlagOn -and $null -ne $catalog -and [string]$catalog.status -eq 'active' -and [bool]$catalog.flatLayout -eq $true -and $fresh -and $countsMatch -and $null -ne $catalog.deferred -and [int]$catalog.deferred -eq 0 -and [int]$catalog.chats -gt 0)
$flatMappingRemoved = ($null -ne $flatMappingDoc -and [bool]$flatMappingDoc.umbrellaRemoved -eq $true)
$flatStatusRemoved = ($null -ne $catalog -and [bool]$catalog.umbrellaRemoved -eq $true)
$flatStatusUnitsOk = ($null -ne $flatStatusUnits -and [int]$flatStatusUnits -eq $flatRosterUnits)
$flatStatusUnitsOut = $null
if ($null -ne $flatStatusUnits) { $flatStatusUnitsOut = [int]$flatStatusUnits }
$flatLayoutHealthy = ($flatStatusOk -and $flatMappingRemoved -and $flatStatusRemoved -and $flatRegistryReadable -and $flatRosterUnits -gt 0 -and $flatStatusUnitsOk -and $flatMatchedUnits -eq $flatRosterUnits -and $flatMembershipProblems -eq 0 -and $flatUmbrellaAbsent -eq $true)

[ordered]@{
    inspectorVersion = 15
    readOnly = $true
    readiness = $readiness
    catalogHealthy = [bool]$catalogHealthy
    supportVerified = [bool]$supportVerified
    files = $files
    versions = [ordered]@{ paseoCli = $paseoCliVersion; codexCli = $codexCliVersion }
    catalog = [ordered]@{ status = $catalog.status; ageSeconds = $catalogAge; fresh = [bool]$fresh; projects = $catalog.projects; chats = $catalog.chats; verifiedChats = $catalog.verifiedChats; duplicates = $catalog.duplicates; deferred = $catalog.deferred; standaloneChats = $catalog.standaloneChats; standaloneWorkspaces = $catalog.standaloneWorkspaces; standaloneDeferred = $catalog.standaloneDeferred; recentsExcluded = $catalog.recentsExcluded; pollSeconds = $catalog.pollSeconds; currentGenerationMatches = [bool]$generationMatches }
    transport = [ordered]@{ controlProtocol = [int]$gateway.controlProtocol; controlledReloadAvailable = ([int]$gateway.controlProtocol -ge 2); reachable = ($null -ne $gateway); backendReady = [bool]$ready; desktopInitialized = [bool]$desktopInitialized; paseoInitialized = [bool]$paseoInitialized; userDesktopRouteMatches = $desktopRouteMatches; providerUsesBridge = $providerUsesBridge; providerEnabled = $providerEnabled; adapterHealth = $adapterHealth; historyRecovery = $recovery; historyRecoveryTask = $recoveryTask; historyRecoveryWorkers = $recoveryWorkers }
    watcher = [ordered]@{ catalogEnabledMarker = [bool]$catalogEnabled; routingEnabledMarker = [bool]$routingEnabled; recordedWorkerRunning = $workerRunning; catalogTask = $catalogTask; backendStartupTask = $backendTask }
    canonical = [ordered]@{ installed = $canonical.installed; pendingRollout = $canonical.pendingRollout; daemonPart = $canonical.daemonPart; workerLiveCurrent = $canonical.workerLiveCurrent; generationFresh = $canonical.generationFresh; sendTargetExact = $canonical.sendTargetExact; ownerSourceMatches = $canonical.ownerSourceMatches; ownerProcessAlive = $canonical.ownerProcessAlive; active = [bool]$canonical.active; actorTask = $canonicalTask; rolloutStatus = [string]$canonicalRollout.status; verifyStatus = [string]$canonicalVerify.status }
    selectedHistory = $selectedHistory
    flat = [ordered]@{ flagOn = [bool]$flatFlagOn; statusFlatLayout = [bool]$catalog.flatLayout; statusUmbrellaRemoved = [bool]$catalog.umbrellaRemoved; mappingUmbrellaRemoved = [bool]$flatMappingDoc.umbrellaRemoved; statusUnits = $flatStatusUnitsOut; rosterUnits = [int]$flatRosterUnits; matchedUnits = [int]$flatMatchedUnits; membershipProblems = [int]$flatMembershipProblems; registryReadable = [bool]$flatRegistryReadable; umbrellaAbsent = $flatUmbrellaAbsent; healthy = [bool]$flatLayoutHealthy; scope = 'Flat workspace layout only; out-of-scope native catalog/history failures stay honest and are not overridden by this field.' }
    hooks = [ordered]@{ importMarkerPresent = $hookImport; payloadMarkerPresent = $hookPayload; questionSyncMarkersPresent = $questionMarkers; sendProviderMarkersPresent = $sendMarkers; sendSessionMarkersPresent = $sendSessionMarkers; questionSync = [ordered]@{ installed = $questionSync.installed; fresh = [bool]$questionSyncFresh; packageVersion = [string]$questionSync.packageVersion; pendingRollout = [bool]$questionSync.pendingRollout; rollout = [ordered]@{ status = [string]$questionRollout.status; detail = [string]$questionRollout.detail }; rolloutTask = $questionRolloutTask }; sendSync = [ordered]@{ installed = $sendSync.installed; fresh = [bool]$sendSyncFresh; packageVersion = [string]$sendSync.packageVersion; pendingRollout = [bool]$sendSync.pendingRollout; rollout = [ordered]@{ status = [string]$sendRollout.status; detail = [string]$sendRollout.detail }; rolloutTask = $sendRolloutTask } }
    savedTargetChatVerification = [ordered]@{ currentSyncVerified = $savedLive.currentSyncVerified; liveUITestPassed = $savedLive.liveUITestPassed; currentGenerationMatches = ($null -ne $gateway -and $null -ne $savedLive.verifiedBackendGeneration -and $savedLive.verifiedBackendGeneration -eq $gateway.backend.generation); evidence = 'Saved status only; this inspector does not run live UI or history tests.' }
    warnings = @($warnings.ToArray())
} | ConvertTo-Json -Depth 8

