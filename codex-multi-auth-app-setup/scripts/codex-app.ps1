#!/usr/bin/env pwsh
# SHARED-CANONICAL-REVISION=9
# codex-app.ps1 — Manual launcher for the NEW ChatGPT desktop app (the one
# formerly branded "Codex") and the shared Paseo backend.
#
# Revision anchor (installer no-downgrade rule): the setup installer refuses
# to copy a skill-bundled launcher over this file when the bundled revision
# is LOWER than the installed one. Higher number always means newer. Every
# skill copy must carry the same revision AND be byte-identical to this
# primary (hash-match rule); a same-revision content drift also refuses.
#
# Target app: Microsoft Store MSIX package `OpenAI.Codex` -> ChatGPT.exe
#             AppUserModelID: OpenAI.Codex_<pub>!App
#             (resolved dynamically below so app updates don't break this)
#
# NOT affected: "ChatGPT Classic" (OpenAI.ChatGPT-Desktop / ChatGPT Classic.exe)
# is a different, older app and is intentionally never touched here.
#
# MANUAL-FORCE DEFAULT (user-authorized): invoking this launcher
# intentionally interrupts running shared Codex replies — no idle waiting,
# no refusal for busy state. Running replies are cancelled via a bounded
# turn/interrupt phase (one absolute ~10s budget over the authenticated
# gateway check channel, never replayed or resent) and are NEVER replayed
# or resent. Unattended tasks (catalog/history/question) stay conservative
# idle-only and never call this force path.
#
# ORDERING (shared mode): the old shared native still runs on the OLD auth
# and can cache/rotate it, so the exact owned supervisor+native quiesce
# (Desktop family exit, then generation-checked backend stop, no respawn)
# ALWAYS happens BEFORE any account switch. The backend then boots once on
# the new auth. A failed switch reboots the old/current runtime and
# rethrows the original error — never a silent account change.
#
# Testability contract (do not weaken): every external effect flows through
# the $Seams table (explicit parameter, never scope magic), so isolated
# fixtures drive the REAL control flow with fakes. Production builds the
# default table once per run.
#
# Usage:
#   codex-app             # FORCE: interrupt replies, restart Desktop + backend
#   codex-app 2           # FORCE: stop old runtime, switch to account 2, boot
#   codex-app switch 2    # same as above (explicit syntax)
#   codex-app -Account 2  # same as above (legacy syntax)
#   codex-app -NoStop     # just open/ensure (never stops anything)
#   codex-app -WaitSeconds 30  # GUARDED caller's choice: wait up to 30s idle,
#                              # refuse on busy timeout instead of forcing
#                              # (bounded 0-600 seconds, rejected pre-mutation)
#   codex-app -StopOnly   # explicit manual STOP of Desktop family + owned
#                         # backend with BOTH frozen ports verified released,
#                         # then a boot-scoped manual pause is published so
#                         # healers/startup do NOT respawn until the next
#                         # manual codex-app/-NoStop/switch resumes (or the
#                         # next Windows boot autostarts). Never switches
#                         # auth. Conflicts with -NoStop and any account
#                         # target (rejected before any mutation).
#   codex-stop-all        # same as -StopOnly via the on-PATH entrypoint shim.
#
# Why this exists:
#   * `codex app` (the @openai/codex CLI, even 0.144.1) only detects the non-Store
#     "Codex" installer and prints "Codex Desktop not found". Your app is the
#     Store MSIX package `OpenAI.Codex`, invisible to that detector, so we launch
#     by AppUserModelID instead.
#   * `Get-Process Codex,codex` only stops the `codex.exe` helper — it leaves
#     `ChatGPT.exe` (the real new desktop app) running with the OLD account token
#     cached in memory, so a switch had no visible effect. We stop ChatGPT.exe.

[CmdletBinding()]
param(
    [Parameter(Position=0)]$Target = $null,
    [Parameter(Position=1)][int]$TargetAccount = 0,
    [int]$Account = 0,
    [switch]$NoStop,
    [switch]$StopOnly,
    [int]$WaitSeconds = -1,
    [string]$MutexName = 'Local\PaseoCodexSharedAccountRestart',
    [string]$BridgeDirOverride = '',
    [string]$BackendStartMutexName = 'Local\PaseoCodexSharedBackendStart',
    [int]$BackendStartWaitMs = 30000
)

$ErrorActionPreference = 'Stop'

# Resolve what the user asked into a plan BEFORE any mutation (auth,
# processes, or backend). Returns @{Mode; Account; StopOnly} with Mode in
# 'Open' (NoStop open-only), 'Force' (manual default), 'Guarded'
# (explicit -WaitSeconds). Throws on anything ambiguous or invalid.
# NOTE: the local selected-account variable is deliberately NOT named
# $account/$Account (PowerShell variables are case-insensitive, so a
# lowercase twin would silently clobber the parameter).
function Resolve-CodexAppPlan {
    param($Target,[int]$TargetAccount,[int]$Account,[switch]$NoStop,[int]$WaitSeconds,[switch]$StopOnly)
    if($WaitSeconds -lt -1 -or $WaitSeconds -gt 600){throw 'Invalid -WaitSeconds (use -1 for manual force, or 0 to 600 seconds for a guarded idle wait).'}
    if($StopOnly -and $NoStop){throw 'Conflicting switches: -StopOnly stops the runtime, -NoStop only opens it; specify one.'}
    $selectedAccount=$null
    $targetText=if($null -eq $Target){''}else{[string]$Target}
    $isSwitch=($targetText -ne '' -and $targetText.ToLowerInvariant() -eq 'switch')
    if($isSwitch){
        if($TargetAccount -le 0){throw 'Usage: codex-app switch <account number starting at 1>.'}
        if($TargetAccount -gt 2147483647){throw 'Invalid account number.'}
        $selectedAccount=$TargetAccount
    }elseif($targetText -ne ''){
        $parsed=0
        if(-not [int]::TryParse($targetText,[ref]$parsed)){throw "Invalid codex-app target '$targetText' (use an account number or 'switch <N>')."}
        if($parsed -le 0 -or $parsed -gt 2147483647){throw 'Invalid account number (use 1 and up).'}
        $selectedAccount=$parsed
    }
    if($Account -ne 0){
        if($Account -le 0 -or $Account -gt 2147483647){throw 'Invalid -Account number (use 1 and up).'}
        if($null -ne $selectedAccount -and $selectedAccount -ne $Account){throw 'Conflicting account numbers; specify one target only.'}
        $selectedAccount=$Account
    }
    if($TargetAccount -ne 0 -and -not $isSwitch){throw "Unexpected second positional argument; use 'codex-app switch <N>'."}
    $switchRequested=$null -ne $selectedAccount
    if($StopOnly -and $switchRequested){throw 'Conflicting request: -StopOnly stops without switching auth; use codex-app <account number> to switch.'}
    if($NoStop -and $switchRequested){throw 'Use codex-app <account number> for an account switch; -NoStop only opens the frontend.'}
    if($NoStop){return @{Mode='Open';Account=$null;StopOnly=$false}}
    if($WaitSeconds -ge 0){return @{Mode='Guarded';Account=$selectedAccount;StopOnly=([bool]$StopOnly)}}
    return @{Mode='Force';Account=$selectedAccount;StopOnly=([bool]$StopOnly)}
}

# Production seams: thin wrappers over the real environment. Fixtures pass
# their own table; nothing else in this file touches the outside world.
function New-ProductionSeams {
    param($BridgeDir)
    # Closure-safety (proven by fixture on both engines): GetNewClosure
    # seams must not call sibling functions BY NAME — under &-invocation the
    # definition scope is invisible to the closure. Capture the body first.
    $boundedFn=${function:Invoke-BoundedNodeChild}
    # Canonical classifier transport: each closure dot-sources the module
    # ITSELF (by bridge dir) and then calls it BY NAME in that same live
    # scope. Captured ${function:} bodies do NOT work: their internal
    # sibling calls resolve in the caller's scope after the factory
    # returns (proven by a production read-only probe). A missing module
    # file throws inside the closure, which every caller treats as
    # unavailable/refuse (fail-closed). No module load happens here, so
    # standalone (non-shared) tables never require the bridge file.
    return @{
        ReadBridgeJson = { param($Name) Get-Content -LiteralPath (Join-Path $BridgeDir $Name) -Raw | ConvertFrom-Json }.GetNewClosure()
        RunNode = { param($NodeExe,$Script,$Arguments) & $boundedFn $NodeExe $Script $Arguments }.GetNewClosure()
        RunMultiAuthSwitch = { param($Index)
            # Bounded switch (default 120s, override PASEO_CODEXAPP_SWITCH_TIMEOUT_MS
            # for fixtures): an auth switch must never hang a manual invocation
            # forever. Exact executable resolution (npm shim -> node + JS entry,
            # no PATH guessing). Fixture isolation: PASEO_CODEXAPP_NODE_EXE /
            # PASEO_CODEXAPP_SWITCH_JS override resolution, but ONLY to a node
            # binary plus a JS entry under the Temp root (SENTINEL); if either
            # override is present yet invalid, this throws fail-closed and
            # NEVER falls back to the real auth CLI. On timeout the exact
            # owned child is deliberately NOT killed — killing mid-switch
            # could corrupt auth state. A durable exact-identity fence (pid +
            # process start ticks + executable/command proof + nonce) is
            # published BEFORE the wait can escape scope, so no later
            # launcher/healer may boot or switch beneath that live mutator;
            # expiry reports 999 (uncertain, verify before retrying). A clean
            # exit clears exactly its own nonce fence. Self-contained: only
            # the $BridgeDir parameter and cmdlets (closure-safe).
            $boundMs=120000
            try{
                $envMs=[int]$env:PASEO_CODEXAPP_SWITCH_TIMEOUT_MS
                if($envMs -gt 0){$boundMs=$envMs}
            }catch{}
            $fenceFile=Join-Path $BridgeDir 'account-switch-fence.private.json'
            $npmRoot=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'npm'
            $nodeExe=$env:PASEO_CODEXAPP_NODE_EXE
            $jsEntry=$env:PASEO_CODEXAPP_SWITCH_JS
            $fixtureMode=(-not [string]::IsNullOrWhiteSpace($nodeExe)) -or (-not [string]::IsNullOrWhiteSpace($jsEntry))
            if([string]::IsNullOrWhiteSpace($nodeExe)){$nodeExe=Join-Path $npmRoot 'node.exe'}
            if([string]::IsNullOrWhiteSpace($jsEntry)){$jsEntry=Join-Path $npmRoot 'node_modules\codex-multi-auth\scripts\codex-multi-auth.js'}
            if(-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)){throw 'Node executable for codex-multi-auth not found.'}
            if(-not (Test-Path -LiteralPath $jsEntry -PathType Leaf)){throw 'codex-multi-auth JS entry not found.'}
            if($fixtureMode){
                # Strict fixture-only override: the JS entry must resolve
                # inside the Temp root, or this fails closed (never real auth).
                try{
                    $jsFull=[IO.Path]::GetFullPath($jsEntry)
                    $tmpRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
                    if(-not $jsFull.StartsWith($tmpRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture switch entry is outside the Temp root; refusing.'}
                }catch{
                    throw 'Fixture switch resolution invalid; refusing to run any switch.'
                }
            }
            $nonce=([Guid]::NewGuid().ToString('N'))
            # Pre-mutation intent: publish proven durable authority BEFORE the
            # child exists, so no auth mutation can escape fenced scope. The
            # intent carries the OWNER creation + descriptor (spawner pid +
            # spawner start ticks + human descriptor), so an operator can
            # always verify settlement and recover — no permanent
            # unverifiable intent without recovery evidence.
            $ownerPid=$PID
            $ownerTicks=$null;$ownerDesc=("codex-app switch $Index")
            try{$ownerTicks=[int64][Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().Ticks}catch{$ownerTicks=$null}
            try{
                if($null -eq $ownerTicks){throw 'owner creation unprovable'}
                [ordered]@{version=1;phase='intent';nonce=$nonce;account=$Index;nodeExe=$nodeExe;jsEntry=$jsEntry;args=@('switch',"$Index");ownerPid=$ownerPid;ownerStartTicks=$ownerTicks;ownerDesc=$ownerDesc;at=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath ($fenceFile+'.tmp') -Encoding utf8
                Move-Item -LiteralPath ($fenceFile+'.tmp') -Destination $fenceFile -Force
                $intent=Get-Content -LiteralPath $fenceFile -Raw -ErrorAction Stop|ConvertFrom-Json
                if($intent.nonce -ne $nonce -or $intent.phase -ne 'intent'){throw 'intent verify mismatch'}
            }catch{
                throw 'Switch intent fence could not be published and proven; refusing to start any switch.'
            }
            try{
                $sw=Start-Process -FilePath $nodeExe -ArgumentList @($jsEntry,'switch',"$Index") -WindowStyle Hidden -PassThru
            }catch{
                # Spawn failed: no child exists, so our own nonce intent is
                # safely settled (nonce-checked, never a foreign fence) and
                # the switch refuses with settlement evidence. The live child
                # is NEVER killed mid-mutation — here there is no child.
                try{
                    $cur=Get-Content -LiteralPath $fenceFile -Raw -ErrorAction Stop|ConvertFrom-Json
                    if($cur.nonce -eq $nonce){
                        [ordered]@{version=1;phase='settled-spawn-failed';nonce=$nonce;account=$Index;ownerPid=$ownerPid;ownerStartTicks=$ownerTicks;ownerDesc=$ownerDesc;error=[string]$_.Exception.Message;at=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath ($fenceFile+'.tmp') -Encoding utf8
                        Move-Item -LiteralPath ($fenceFile+'.tmp') -Destination $fenceFile -Force
                        Remove-Item -LiteralPath $fenceFile -Force -ErrorAction Stop
                    }
                }catch{}
                throw 'codex-multi-auth switch could not be started; the intent fence was settled and no auth was mutated.'
            }
            try{
                # Bind the exact child identity immediately: pid + start ticks +
                # executable. The intent fence above already guards scope; this
                # upgrade is retried briefly for transient IO. If it cannot be
                # proven, the intent fence STAYS (blocking all future
                # switch/boot as uncertain, carrying owner creation +
                # descriptor for operator recovery) and the switch refuses —
                # the live child is NEVER killed as a fence-write fallback.
                $boundIdentity=$false
                for($bindTry=0;$bindTry -lt 3 -and -not $boundIdentity;$bindTry++){
                    try{
                        [ordered]@{version=1;phase='active';pid=$sw.Id;startTime=$sw.StartTime.ToString('o');startTicks=$sw.StartTime.ToUniversalTime().Ticks;nodeExe=$nodeExe;jsEntry=$jsEntry;args=@('switch',"$Index");account=$Index;nonce=$nonce;ownerPid=$ownerPid;ownerStartTicks=$ownerTicks;ownerDesc=$ownerDesc;at=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath ($fenceFile+'.tmp') -Encoding utf8
                        Move-Item -LiteralPath ($fenceFile+'.tmp') -Destination $fenceFile -Force
                        $check=Get-Content -LiteralPath $fenceFile -Raw -ErrorAction Stop|ConvertFrom-Json
                        if($check.nonce -ne $nonce){throw 'fence verify mismatch'}
                        $boundIdentity=$true
                    }catch{
                        Start-Sleep -Milliseconds 500
                    }
                }
                if(-not $boundIdentity){
                    throw 'Switch child identity fence could not be proven; the pre-mutation intent fence remains and blocks every future switch/boot until an operator verifies settlement and clears it.'
                }
                if($sw.WaitForExit($boundMs)){
                    $code=$sw.ExitCode
                    try{
                        $cur=Get-Content -LiteralPath $fenceFile -Raw -ErrorAction Stop|ConvertFrom-Json
                        if($cur.nonce -eq $nonce){Remove-Item -LiteralPath $fenceFile -Force -ErrorAction Stop}
                    }catch{}
                    return $code
                }
                try{
                    if($sw.HasExited){
                        $code=$sw.ExitCode
                        try{
                            $cur=Get-Content -LiteralPath $fenceFile -Raw -ErrorAction Stop|ConvertFrom-Json
                            if($cur.nonce -eq $nonce){Remove-Item -LiteralPath $fenceFile -Force -ErrorAction Stop}
                        }catch{}
                        return $code
                    }
                }catch{}
                # Still running past the bound: the proven fence stays (it
                # was verified above); report uncertain. Consulted before
                # every future switch/boot until that exact child settles.
                return 999
            }finally{
                try{$sw.Dispose()}catch{}
            }
        }.GetNewClosure()
        ListProcesses = { Get-CimInstance Win32_Process }.GetNewClosure()
        GetProcessById = { param($Id) Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$Id) }.GetNewClosure()
        StopProc = { param($Id) Stop-Process -Id ([int]$Id) -ErrorAction SilentlyContinue }.GetNewClosure()
        # Frozen-port preflight queries (module verdict logic stays
        # single-sourced in Backend-PortPreflight.ps1; these are raw data
        # only, mirroring the module defaults exactly). Fixtures inject
        # fakes for all three; a missing trio keeps legacy behavior.
        ListFrozenListeners = { param($Ports) @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
            ($_.LocalPort -in $Ports) -and ($_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::')
        }) }.GetNewClosure()
        LookupProcess = { param($Id) Get-Process -Id $Id -ErrorAction Stop }.GetNewClosure()
        BootQuery = { Get-CimInstance Win32_OperatingSystem -ErrorAction Stop }.GetNewClosure()
        PreflightClassify = { param($BridgeDir,$Owned,$Lq,$Lp,$Sl) . (Join-Path $BridgeDir 'Backend-PortPreflight.ps1'); Test-FrozenPortPreflight -OwnedPids $Owned -ListenerQuery $Lq -LookupProcess $Lp -SleepMs $Sl }.GetNewClosure()
        PositiveDeath = { param($BridgeDir,$ProcId,$Lp,$Sl) . (Join-Path $BridgeDir 'Backend-PortPreflight.ps1'); Test-ProcessPositiveDeath -ProcId $ProcId -LookupProcess $Lp -SleepMs $Sl }.GetNewClosure()
        PauseTest = { param($Dir,$Bq) . (Join-Path $Dir 'Backend-PortPreflight.ps1'); Test-ManualPause -BridgeDir $Dir -BootQuery $Bq }.GetNewClosure()
        PausePublish = { param($Dir,$Reason,$Bq) . (Join-Path $Dir 'Backend-PortPreflight.ps1'); Publish-ManualPause -BridgeDir $Dir -Reason $Reason -BootQuery $Bq }.GetNewClosure()
        PauseClear = { param($Dir) . (Join-Path $Dir 'Backend-PortPreflight.ps1'); Clear-ManualPause -BridgeDir $Dir }.GetNewClosure()
        ProveIdentity = { param($BDir,$Set,$SeamTable,$Preflight) . (Join-Path $BDir 'Backend-PortPreflight.ps1'); Invoke-OwnedIdentityProof -BridgeDir $BDir -Settings $Set -Seams $SeamTable -Preflight $Preflight }.GetNewClosure()
        StartProc = { param($Path) Start-Process $Path }.GetNewClosure()
        SleepMs = { param($Ms) Start-Sleep -Milliseconds $Ms }.GetNewClosure()
        SleepSec = { param($Sec) Start-Sleep -Seconds $Sec }.GetNewClosure()
        RestStatus = { Invoke-RestMethod -Uri 'http://127.0.0.1:19458/status' -TimeoutSec 3 }.GetNewClosure()
        GetAppx = { param($Name) Get-AppxPackage -Name $Name -ErrorAction SilentlyContinue | Sort-Object Version -Descending | Select-Object -First 1 }.GetNewClosure()
        EnsureBackend = { & (Join-Path $BridgeDir 'Ensure-Backend.ps1') }.GetNewClosure()
        EnsureBackendRecoverFailed = { & (Join-Path $BridgeDir 'Ensure-Backend.ps1') -RecoverFailed }.GetNewClosure()
        OpenSharedApps = { & (Join-Path $BridgeDir 'Open-Shared-Apps.ps1') }.GetNewClosure()
        RestartIdleBackend = { & (Join-Path $BridgeDir 'Restart-Idle-Backend.ps1') }.GetNewClosure()
        StopBackendIdle = { param($Dir,$Settings) . (Join-Path $Dir 'Backend-Control.ps1'); Stop-LegacySharedSupervisor -BridgeDir $Dir -Settings $Settings }.GetNewClosure()
        StopBackendForced = { param($Dir,$Settings) . (Join-Path $Dir 'Backend-Control.ps1'); Stop-LegacySharedSupervisor -BridgeDir $Dir -Settings $Settings -ForceManual }.GetNewClosure()
    }
}

# Bounded child execution for node helpers (production cancel path and
# guarded idle checks). The old `&` form waited forever on a hung child;
# this form bounds the whole call (default 12s: 10s helper budget plus a
# small cleanup margin) with async stdout/stderr drain, and on expiry
# terminates ONLY the exact child handle created here — never a process
# tree, never by process name. Returns @{code=[int]; output=[string]}: the
# helper's real exit/output, or code 2 with a synthetic soft report so
# manual force continues its owned quiesce instead of hanging.
function Quote-NodeArgument {
    param([string]$Text)
    if ($Text.Length -eq 0 -or $Text.Contains(' ') -or $Text.Contains("`t") -or $Text.Contains('"')) {
        $escaped = ($Text -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1'
        return '"' + $escaped + '"'
    }
    return $Text
}

function Invoke-BoundedNodeChild {
    param($NodeExe,$Script,$Arguments,[int]$TimeoutMs = 12000)
    $argList = @([string]$Script) + @($Arguments | ForEach-Object { [string]$_ })
    $quoted = @($argList | ForEach-Object { Quote-NodeArgument $_ }) -join ' '
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = [string]$NodeExe
    $psi.Arguments = $quoted
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = [Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    try {
        # No PowerShell scriptblock event handlers here: add_OutputDataReceived
        # callbacks run on .NET threadpool threads with no runspace under
        # PS5.1/7 (throws 'no Runspace available' or deadlocks while the
        # runspace blocks in WaitForExit). Async ReadToEndAsync tasks drain
        # the pipes without a runspace and are reaped with bounded waits.
        try { [void]$proc.Start() } catch {
            return @{code = 2; output = '{"interrupted":0,"alreadyIdle":0,"stillRunning":0,"unknown":0,"soft":"cancel-child-spawn-failed"}'}
        }
        $outTask = $proc.StandardOutput.ReadToEndAsync()
        $errTask = $proc.StandardError.ReadToEndAsync()
        if (-not $proc.WaitForExit($TimeoutMs)) {
            try { if (-not $proc.HasExited) { $proc.Kill() } } catch {}
            try { [void]$proc.WaitForExit(5000) } catch {}
            return @{code = 2; output = '{"interrupted":0,"alreadyIdle":0,"stillRunning":0,"unknown":0,"soft":"cancel-child-timeout"}'}
        }
        $output = ''
        try { if ($outTask.Wait(5000)) { $output = $outTask.Result } } catch {}
        try { if ($errTask.Wait(2000)) { $output += "`n" + $errTask.Result } } catch {}
        if ($output.Length -gt 8192) { $output = $output.Substring(0, 8192) }
        return @{code = [int]$proc.ExitCode; output = $output}
    } finally {
        try { $proc.Dispose() } catch {}
    }
}

# Quiescent guard: holds the REAL shared backend-start mutex across the
# exact stop+switch interval so no logon KeepAlive or parallel Ensure/Open
# can boot the OLD auth between our stop and our switch. Released (finally,
# idempotent) BEFORE any child Ensure/Open runs: those are separate
# processes and would deadlock against a held mutex. Same-thread re-entry
# is safe (.NET mutexes are reentrant); concurrent NoStop/startup calls
# serialize behind this hold via their own Ensure wait.
function Enter-BackendStartGuard {
    param([string]$MutexName,[int]$WaitMs)
    $guard = [Threading.Mutex]::new($false, $MutexName)
    $acquired = $false
    try { $acquired = $guard.WaitOne($WaitMs) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
        $guard.Dispose()
        throw 'Shared backend startup is busy (another installer holds it). Retry after it finishes; nothing was stopped.'
    }
    return @{Mutex = $guard; Released = $false}
}

function Exit-BackendStartGuard {
    param($Guard)
    if ($null -eq $Guard -or $Guard.Released) { return }
    $Guard.Released = $true
    try { $Guard.Mutex.ReleaseMutex() } catch {}
    try { $Guard.Mutex.Dispose() } catch {}
}

function Resolve-ChatGptDesktopAumid {
    param($Seams)
    $pkg = & $Seams.GetAppx 'OpenAI.Codex'
    if (-not $pkg) {
        throw "New ChatGPT desktop app (MSIX package 'OpenAI.Codex') not found. Install it from the Microsoft Store."
    }
    return "$($pkg.PackageFamilyName)!App"
}

function Wait-SharedRepliesIdle {
    param($Settings,$Seconds,$Seams)
    $deadline=[DateTime]::UtcNow.AddSeconds($Seconds)
    $announced=$false
    do{
        $run=& $Seams.RunNode $Settings.node (Join-Path $Settings.bridgeDir 'check-account-idle.mjs') @()
        $code=$run.code
        if($code -eq 0){Write-Host 'All shared Codex chats are idle.';return}
        if($code -ne 2){throw 'Shared chat status could not be verified. Account switching and Desktop shutdown were deferred.'}
        if([DateTime]::UtcNow -ge $deadline){throw 'A shared reply is still running. Retry after it finishes. Account switching and Desktop shutdown were deferred.'}
        if(-not $announced){Write-Host ('A shared reply is running; waiting up to '+$Seconds+' seconds before switching or restarting.');$announced=$true}
        & $Seams.SleepSec 3
    }while($true)
}

# Bounded manual-force interrupt of running shared replies. Prints plain
# aggregate counts, never replays anything. Returns silently on success or
# best-effort partial (exit 2: some turns unverified — the caller proceeds
# to the exact owned quiesce with notice, which is the authorized force
# behavior); throws only when the helper itself refuses (exit 1:
# unreachable/foreign/stale), in which case the caller must abort instead
# of forcing blindly.
function Invoke-ForceInterrupt {
    param($Settings,$Seams)
    $run=& $Seams.RunNode $Settings.node (Join-Path $Settings.bridgeDir 'interrupt-shared-turns.mjs') @()
    if($run.code -eq 1){throw 'Running replies could not be interrupted safely (backend unreachable, foreign, or changed); nothing was stopped.'}
    $report=$null
    try{$report=($run.output|Out-String|ConvertFrom-Json)}catch{}
    $interrupted=0;$already=0;$still=0;$soft=''
    if($report){
        if($report.interrupted -is [int]){$interrupted=$report.interrupted}
        if($report.alreadyIdle -is [int]){$already=$report.alreadyIdle}
        if($report.stillRunning -is [int]){$still=$report.stillRunning}
        if($report.soft -is [string]){$soft=$report.soft}
    }
    if(($interrupted+$already) -gt 0){Write-Host ("Interrupted $interrupted running shared Codex replies ($already already idle) by manual force; nothing will be replayed.")}
    if($still -gt 0){Write-Host ("$still replies did not settle in the cancel bound; stopping their runtime now by manual force (no replay).")}
    if($soft -ne ''){Write-Host ("Cancel phase incomplete ($soft); stopping the owned runtime now by manual force (no replay).")}
}

function Stop-CodexDesktopFamily {
    param($Seams)
    Write-Host "Stopping the installed Codex Desktop ..." -ForegroundColor Cyan
    # Scope shutdown to this MSIX application's process family. Never kill
    # unrelated CLI sessions or the shared native backend by process name.
    for($stopAttempt=0;$stopAttempt -lt 40;$stopAttempt++){
    $inventory=@(& $Seams.ListProcesses)
    $appProcesses=@(Get-CodexDesktopFamily $Seams)
    if(-not $appProcesses.Count){break}
    $desktopParents=[Collections.Generic.HashSet[int]]::new()
    foreach($appProcess in $appProcesses|Where-Object {$_.CommandLine -notmatch '--type='}){[void]$desktopParents.Add([int]$appProcess.ProcessId)}
    $nativeChildren=@($inventory|Where-Object {$_.Name -eq 'codex.exe' -and $desktopParents.Contains([int]$_.ParentProcessId) -and $_.CommandLine -match 'app-server' -and $_.CommandLine -notmatch '19457'})
    foreach($candidate in @($nativeChildren)+@($appProcesses)){
        $current=& $Seams.GetProcessById ([int]$candidate.ProcessId)
        if($current -and $current.ExecutablePath -eq $candidate.ExecutablePath -and $current.CreationDate -eq $candidate.CreationDate){& $Seams.StopProc ([int]$current.ProcessId)}
    }
    & $Seams.SleepMs 250
    }
    $remaining=@(Get-CodexDesktopFamily $Seams)
    if($remaining.Count){throw 'Desktop did not fully exit within 10 seconds. The shared backend was preserved.'}
}

# Frozen-port preflight module (Backend-PortPreflight.ps1, single canonical
# classifier shared with Backend-Control/Ensure/healers — never duplicated
# here). SCOPE RULE (proven by fixture): the classifier travels ONLY as
# seam closures (PreflightClassify/PositiveDeath/PauseTest/PausePublish/
# PauseClear, captured where the module is loaded — see New-ProductionSeams)
# plus the raw query seams (ListFrozenListeners/LookupProcess/BootQuery).
# PowerShell lexical scoping hides function-scope dot-sourced definitions
# from sibling helpers, so no use site below dot-sources the module
# directly. Fixture tables lacking the classifier trio keep legacy
# behavior; production tables always carry it. The bridge file itself must
# still exist; missing fails closed BEFORE any mutation. Direct call only.
function Assert-PortPreflightModulePresent {
    param([string]$BridgeDir)
    $lib=Join-Path $BridgeDir 'Backend-PortPreflight.ps1'
    if(-not (Test-Path -LiteralPath $lib -PathType Leaf)){throw 'Frozen-port preflight module is missing from this bridge; refusing to proceed blind.'}
    return $lib
}
function Get-RecordOwnedPids {
    param($Seams,$BridgeDir)
    $pids=@()
    try{
        $rec=& $Seams.ReadBridgeJson 'service.private.json'
        foreach($rp in @($rec.pid,$rec.backendPid)){
            $ri=0
            if($rp -is [int] -or $rp -is [long]){$ri=[int]$rp}
            elseif([int]::TryParse([string]$rp,[ref]$ri)){}
            else{continue}
            if($ri -gt 0){$pids+=@($ri)}
        }
    }catch{}
    return $pids
}
# Ghost/foreign/unknown gate BEFORE any Desktop/backend/auth mutation.
# Returns the preflight object for reuse (already-stopped proof below), or
# $null when the classifier seams are absent (fixture tables testing legacy
# paths, or standalone non-shared flows without the bridge module: caller
# keeps prior behavior). Throws on ghost/foreign/unknown — zero mutations
# on any of these paths. The classifier closure dot-sources the canonical
# module itself, so this works after any factory scope has returned.
function Assert-NoGhostBeforeMutation {
    param($BridgeDir,$Seams)
    if($null -eq $Seams.PreflightClassify -or $null -eq $Seams.ListFrozenListeners -or $null -eq $Seams.LookupProcess -or $null -eq $Seams.SleepMs){return $null}
    $owned=Get-RecordOwnedPids $Seams $BridgeDir
    $pf=$null
    try{
        $pf=& $Seams.PreflightClassify $BridgeDir $owned $Seams.ListFrozenListeners $Seams.LookupProcess $Seams.SleepMs
    }catch{$pf=$null}
    if($null -eq $pf){throw 'Frozen-port preflight is unavailable; refusing to mutate an unverified backend.'}
    if($pf.verdict -eq 'ghost-reboot-required'){throw 'ghost socket — reboot required: a frozen port is LISTENING but its recorded owner is positively dead. Only a Windows reboot clears it; nothing was cancelled, stopped, or switched.'}
    if($pf.verdict -eq 'foreign-refuse'){throw 'A foreign process owns a frozen port; refusing before any mutation. Nothing was stopped.'}
    if($pf.verdict -ne 'free' -and $pf.verdict -ne 'owned-live'){throw 'Frozen-port ownership is unverifiable (unknown or access-denied); refusing before any mutation. Nothing was stopped.'}
    return $pf
}
# Exact owned-backend identity gate: delegates to the single-sourced
# gather+proof in the canonical module (Invoke-OwnedIdentityProof via the
# ProveIdentity seam, which dot-sources the module itself — same closure
# transport as the classifier). Tokenized exact argv (node exe + service
# script token; app-server + adjacent --listen wsUrl token — never
# substrings) plus exact integration/generation/birth/listener proofs.
# Returns 'owned-proven' | 'already-stopped' | 'failed-owned' |
# 'refuse:<reason>'. Never throws.
function Test-OwnedBackendIdentity {
    param($BridgeDir,$Settings,$Seams,$Preflight)
    if($null -eq $Seams.ProveIdentity){return 'refuse:identity-seams-unavailable'}
    try{return (& $Seams.ProveIdentity $BridgeDir $Settings $Seams $Preflight)}catch{return 'refuse:error'}
}
# MSIX Desktop family inventory (shared predicate: only the NEW
# OpenAI.Codex family, never Classic or unrelated processes). Used both to
# stop and to PROVE desktopGone (never a hardcoded declaration).
function Get-CodexDesktopFamily {
    param($Seams)
    return @(& $Seams.ListProcesses|Where-Object {$_.Name -in @('ChatGPT.exe','Codex.exe') -and $_.ExecutablePath -match '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(ChatGPT|Codex)\.exe$'})
}
# Shared canonical full stop (codex-app -StopOnly AND the codex-stop-all
# entrypoint — one implementation): Desktop family, then the owned backend
# (skipped only on positive already-stopped proof), then BOTH frozen ports
# re-verified released, then the boot-scoped manual pause is published so
# KeepAlive/recovery/startup/Ensure observe it and do NOT respawn until a
# manual resume or the next Windows boot. No auth change ever. No backend
# KeepAlive JOB/task parent is killed — automatic boot is disabled purely
# logically via the pause marker. No long mutex is held after return.
function Stop-CodexAllComplete {
    param($BridgeDir,$Settings,$Seams,$BackendStartMutexName,$BackendStartWaitMs)
    Assert-PortPreflightModulePresent $BridgeDir | Out-Null
    $pf=Assert-NoGhostBeforeMutation $BridgeDir $Seams
    $identity=Test-OwnedBackendIdentity $BridgeDir $Settings $Seams $pf
    if($identity -ne 'owned-proven' -and $identity -ne 'already-stopped' -and $identity -ne 'failed-owned'){throw ('Owned backend identity unproven before the manual stop (' + $identity + '); nothing was stopped.')}
    $stopGuard=Enter-BackendStartGuard -MutexName $BackendStartMutexName -WaitMs $BackendStartWaitMs
    try{
        $pf2=Assert-NoGhostBeforeMutation $BridgeDir $Seams
        $id2=Test-OwnedBackendIdentity $BridgeDir $Settings $Seams $pf2
        if($id2 -ne 'owned-proven' -and $id2 -ne 'already-stopped' -and $id2 -ne 'failed-owned'){throw ('Owned backend identity changed while acquiring the startup guard (' + $id2 + '); nothing was stopped.')}
        Stop-CodexDesktopFamily $Seams
        if($id2 -ne 'already-stopped'){
            & $Seams.StopBackendForced $BridgeDir $Settings
        }
        $rel=$null
        try{
            if($null -ne $Seams.PreflightClassify -and $null -ne $Seams.ListFrozenListeners){
                $owned=Get-RecordOwnedPids $Seams $BridgeDir
                $rel=& $Seams.PreflightClassify $BridgeDir $owned $Seams.ListFrozenListeners $Seams.LookupProcess $Seams.SleepMs
            }
        }catch{$rel=$null}
        if($null -eq $rel -or $rel.verdict -ne 'free'){throw 'Shared ports were not released by the manual stop; no auth was changed and no pause was published.'}
        # Post-stop ownership settlement: every recorded owned identity must
        # be positively dead — a live owned native with freed ports could
        # still hold cached auth. Unknown/denied refuses even on free ports.
        if($null -eq $Seams.PositiveDeath){throw 'Post-stop identity proof is unavailable; refusing an unproven stop.'}
        $ownedPost=Get-RecordOwnedPids $Seams $BridgeDir
        foreach($pidInt in $ownedPost){
            $life=$null
            try{$life=& $Seams.PositiveDeath $BridgeDir ([int]$pidInt) $Seams.LookupProcess $Seams.SleepMs}catch{$life='unknown'}
            if($life -ne 'dead'){throw 'A recorded owned process is not positively dead after the stop; refusing an unproven stop (no pause published).'}
        }
        $goneCount=@(Get-CodexDesktopFamily $Seams).Count
        if($goneCount -ne 0){throw 'Desktop family processes remain after the stop; refusing an unproven stop (no pause published).'}
        $bq=$null
        if($null -ne $Seams.BootQuery){$bq=$Seams.BootQuery}
        if($null -eq $Seams.PausePublish -or $null -eq $Seams.PauseTest){throw 'Manual-pause seams are unavailable; refusing to leave an unmarked stop.'}
        & $Seams.PausePublish $BridgeDir 'manual-stop' $bq
        $pause=& $Seams.PauseTest $BridgeDir $bq
        if($pause.State -ne 'active'){throw 'Manual pause was not proven active after publishing; refusing an unmarked stop.'}
    }finally{
        Exit-BackendStartGuard -Guard $stopGuard
    }
    Write-Host 'Shared Codex runtime stopped: desktopGone=True portsFree=True ownedDead=True pauseActive=True. Next manual codex-app/-NoStop/switch resumes; next Windows boot autostarts.' -ForegroundColor Green
}

# Exact-identity switch fence consult: delegates to the canonical proof in
# Backend-Control.ps1 (single source shared with supervisor, pulse, and
# rollouts). The control file is resolved from the given bridge dir, so
# fixture launcher copies without it fail closed to 'unknown' (block) rather
# than running a weaker local proof. Direct call only.
function Test-SwitchFence {
    param([string]$BridgeDir)
    try{
        $ctl=Join-Path $BridgeDir 'Backend-Control.ps1'
        if(-not (Test-Path -LiteralPath $ctl -PathType Leaf)){return 'unknown'}
        . $ctl
        return Test-SwitchAuthFence -BridgeDir $BridgeDir
    }catch{return 'unknown'}
}
function Switch-CodexAuth {
    param($Index,$Seams)
    Write-Host "Switching codex-multi-auth to account $Index ..." -ForegroundColor Cyan
    $code=& $Seams.RunMultiAuthSwitch $Index
    if ($code -eq 999) { throw "codex-multi-auth switch $Index did not complete within 120s; left running (never killed mid-switch). Verify its state before retrying." }
    if ($code -ne 0) { throw "codex-multi-auth switch $Index failed (exit $code)." }
}

function Invoke-CodexApp {
    param($Target,[int]$TargetAccount,[int]$Account,[switch]$NoStop,[int]$WaitSeconds,$MutexName,$BridgeDirOverride,$Seams,$BackendStartMutexName,$BackendStartWaitMs,[switch]$StopOnly)
    if($null -eq $BackendStartMutexName -or $BackendStartMutexName -eq ''){$BackendStartMutexName='Local\PaseoCodexSharedBackendStart'}
    if($null -eq $BackendStartWaitMs){$BackendStartWaitMs=30000}
    $plan=Resolve-CodexAppPlan -Target $Target -TargetAccount $TargetAccount -Account $Account -NoStop:$NoStop -WaitSeconds $WaitSeconds -StopOnly:$StopOnly
    $bridgeDir=if($BridgeDirOverride -ne ''){$BridgeDirOverride}else{(Join-Path $env:USERPROFILE '.paseo\codex-shared-bridge')}
    if($null -eq $Seams){$Seams=New-ProductionSeams $bridgeDir}
    # The canonical classifier travels ONLY as seam closures (each closure
    # dot-sources the canonical module itself at call time, so the verdict
    # logic works after any factory scope has returned). Standalone
    # non-shared flows never require the bridge module file; the shared
    # paths assert its presence before use.
    $sharedMode=Test-Path -LiteralPath (Join-Path $bridgeDir 'routing-enabled.json')
    $restartGuard=[Threading.Mutex]::new($false,$MutexName)
    # Bounded healthy contention: a first instant probe fails fast when truly
    # idle; when another operation (manual codex-app, rollout critical
    # section) holds the lock, wait boundedly (30s in 500ms slices) for it to
    # finish instead of erroring at once. Never steals a live lock, never
    # kills a holder: expiry reports which class of holder is likely (a live
    # codex-app/rollout process vs unknown) with a retry action. The lock is
    # always released in the outer finally below.
    $acquired=$false
    try{$acquired=$restartGuard.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
    if(-not $acquired){
        # Fixture override only (default 30s): PASEO_CODEXAPP_LOCKWAIT_SEC.
        $lockWaitSec=30
        try{
            $envLock=[int]$env:PASEO_CODEXAPP_LOCKWAIT_SEC
            if($envLock -gt 0){$lockWaitSec=$envLock}
        }catch{}
        $waitUntil=[DateTime]::UtcNow.AddSeconds($lockWaitSec)
        while(-not $acquired -and [DateTime]::UtcNow -lt $waitUntil){
            & $Seams.SleepMs 500
            try{$acquired=$restartGuard.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
        }
    }
    if(-not $acquired){
        $hint='unknown holder'
        try{
            $cands=@(& $Seams.ListProcesses|Where-Object {$_.CommandLine -like '*codex-app.ps1*' -or $_.CommandLine -like '*Update-SendSync-WhenIdle.ps1*' -or $_.CommandLine -like '*Update-QuestionSync-WhenIdle.ps1*'})
            if($cands.Count){$hint='another codex-app or rollout operation still running'}
        }catch{}
        $restartGuard.Dispose()
        throw "Another codex-app operation is already running ($hint). Wait for it to finish, then retry; nothing was stopped."
    }
    try{
    # A live prior switch mutator — or an UNVERIFIABLE fence — blocks every
    # new operation: booting or switching beneath it could reload the wrong
    # profile or overlap writes. Only proven-clear/proven-dead proceeds.
    $fenceState=Test-SwitchFence $bridgeDir
    if($fenceState -eq 'live'){throw 'A previous account switch is still running; refusing to overlap it. Wait for it to settle, then retry; nothing was stopped.'}
    if($fenceState -eq 'unknown'){throw 'A previous account switch cannot be verified settled; refusing to proceed blind. Inspect local diagnostics, then retry; nothing was stopped.'}
    if($plan.StopOnly){
        # Explicit manual stop: shared canonical full stop (same
        # implementation as the codex-stop-all entrypoint). Requires the
        # shared backend; never switches auth, never boots. The restart
        # guard (held for this whole call) serializes against concurrent
        # switches/heals; the backend-start guard is scoped inside the
        # stop and released before return — no long mutex held after.
        # Default (WaitSeconds -1) is authorized force. An explicit
        # -StopOnly -WaitSeconds 0/S requests GUARDED stop-only: prove
        # idle first (or vacuous idle on positive already-stopped proof);
        # busy-timeout or unverifiable idleness refuses with ZERO stops
        # and ZERO pause writes. Nothing is ever force-interrupted here.
        if(-not $sharedMode){throw 'codex-app -StopOnly needs the shared backend (routing is not enabled); nothing was stopped.'}
        $sharedSettings=& $Seams.ReadBridgeJson 'settings.json'
        $sharedSettings|Add-Member -NotePropertyName 'bridgeDir' -NotePropertyValue $bridgeDir -Force
        if($plan.Mode -eq 'Guarded'){
            Assert-PortPreflightModulePresent $bridgeDir | Out-Null
            $gpf=Assert-NoGhostBeforeMutation $bridgeDir $Seams
            $gid=Test-OwnedBackendIdentity $bridgeDir $sharedSettings $Seams $gpf
            if($gid -ne 'owned-proven' -and $gid -ne 'already-stopped' -and $gid -ne 'failed-owned'){throw ('Owned backend identity unproven before the guarded stop (' + $gid + '); nothing was stopped and no pause was published.')}
            if($gid -ne 'already-stopped'){
                Wait-SharedRepliesIdle $sharedSettings $WaitSeconds $Seams
            }
        }
        Stop-CodexAllComplete -BridgeDir $bridgeDir -Settings $sharedSettings -Seams $Seams -BackendStartMutexName $BackendStartMutexName -BackendStartWaitMs $BackendStartWaitMs
        return
    }
    if($sharedMode){
        # Shared-only module requirement (standalone non-shared flows never
        # require the bridge file and keep their original interface).
        # Ownership gates FIRST — before pause-clear, cancel, Desktop,
        # backend, auth, or boot. (1) Ghost/foreign/unknown port gate.
        # (2) Exact owned-backend identity (integration+generation+CIM
        # exe/full-argv/birth+native parent+listeners) or positive
        # already-stopped. Refusals throw here with zero mutations; PID
        # reuse can never reach a partial stop.
        Assert-PortPreflightModulePresent $bridgeDir | Out-Null
        $sharedSettings=& $Seams.ReadBridgeJson 'settings.json'
        $sharedSettings|Add-Member -NotePropertyName 'bridgeDir' -NotePropertyValue $bridgeDir -Force
        $preflight=Assert-NoGhostBeforeMutation $bridgeDir $Seams
        $identity=Test-OwnedBackendIdentity $bridgeDir $sharedSettings $Seams $preflight
        if($identity -ne 'owned-proven' -and $identity -ne 'already-stopped' -and $identity -ne 'failed-owned'){throw ('Owned backend identity unproven before the manual operation (' + $identity + '); nothing was stopped, switched, or booted.')}
        $alreadyStopped=($identity -eq 'already-stopped')
        # Explicit manual resume AFTER all ownership gates: active/stale
        # markers clear with PROVEN deletion; unknown intent NEVER clears
        # blindly — it refuses (operator inspects).
        if($null -ne $Seams.PauseTest -and $null -ne $Seams.PauseClear){
            $bq=$null
            if($null -ne $Seams.BootQuery){$bq=$Seams.BootQuery}
            $resumePause=& $Seams.PauseTest $BridgeDir $bq
            if($resumePause.State -eq 'stale' -or $resumePause.State -eq 'active'){
                if(-not (& $Seams.PauseClear $BridgeDir)){throw 'Manual pause marker could not be proven deleted; refusing to boot beneath an uncertain stop. Inspect local diagnostics, then retry; nothing was stopped.'}
                Write-Host 'Resuming from the manual stop (pause cleared by explicit manual request).'
            }elseif($resumePause.State -eq 'unknown'){
                throw 'Manual pause marker is unverifiable (unknown intent); refusing to boot or clear blindly. Inspect local diagnostics, remove the marker only after verifying no stop is in effect, then retry; nothing was stopped.'
            }
        }
        if($plan.Mode -eq 'Force'){
            # A KNOWN failed backend (proven owned + failed state + matching
            # generation) is stopped DIRECTLY — never cold-booted on the old
            # auth just to obtain proof, then stopped again. A ready backend
            # still heals first (crash strikes live in the replaced
            # supervisor and reset on boot). Skipped entirely on positive
            # already-stopped proof (nothing to recover, and booting here
            # would load the OLD auth before the switch).
            if(-not $alreadyStopped){
                $forceLive=$null
                try{$forceLive=& $Seams.RestStatus}catch{$forceLive=$null}
                if($null -ne $forceLive -and $null -ne $forceLive.backend -and [string]$forceLive.backend.state -eq 'failed'){
                    $forceRec=$null
                    try{$forceRec=& $Seams.ReadBridgeJson 'service.private.json'}catch{$forceRec=$null}
                    if($null -eq $forceRec -or [int]$forceRec.generation -ne [int]$forceLive.backend.generation){throw 'Backend changed before the manual restart.'}
                }elseif($null -eq $forceLive -or $null -eq $forceLive.backend){
                    throw 'Backend status is unreachable while the owned runtime should be live; refusing a blind stop. Inspect local diagnostics; nothing was stopped.'
                }else{
                    & $Seams.EnsureBackendRecoverFailed
                }
            }
        }elseif($plan.Mode -eq 'Open' -or -not $alreadyStopped){
            & $Seams.EnsureBackend
        }
        if($plan.Mode -eq 'Open'){
            & $Seams.OpenSharedApps
            Write-Host 'Codex Desktop is connected to the shared Paseo backend.' -ForegroundColor Green
            return
        }
        if($plan.Mode -eq 'Guarded'){
            # Vacuous idle on positive already-stopped proof: no runtime
            # exists to be busy, and no gateway exists to ask.
            if(-not $alreadyStopped){Wait-SharedRepliesIdle $sharedSettings $WaitSeconds $Seams}
        }elseif(-not $alreadyStopped){
            Invoke-ForceInterrupt $sharedSettings $Seams
        }
    }elseif($plan.Mode -eq 'Guarded'){
        # No shared routing: there is nothing shared to wait on (legacy
        # callers passing -WaitSeconds here keep prior behavior).
    }
    if($sharedMode -and $plan.Mode -ne 'Open'){
        # Revalidate after the cancel window: ownership can change while
        # interrupting. Refusals throw BEFORE the Desktop partial stop.
        $preflight=Assert-NoGhostBeforeMutation $bridgeDir $Seams
        $identity=Test-OwnedBackendIdentity $bridgeDir $sharedSettings $Seams $preflight
        if($identity -ne 'owned-proven' -and $identity -ne 'already-stopped' -and $identity -ne 'failed-owned'){throw ('Owned backend identity changed before the Desktop stop (' + $identity + '); nothing was stopped, switched, or booted.')}
        $alreadyStopped=($identity -eq 'already-stopped')
    }
    if (-not $NoStop) {
        Stop-CodexDesktopFamily $Seams
    }
    if($sharedMode){
        if($plan.Mode -eq 'Guarded'){
            if($null -ne $plan.Account){
                if($alreadyStopped){
                    # Safe already-stopped proof: no idle stop to run and
                    # no status to fetch — switch straight to the single
                    # post-switch boot. The backend-start guard still spans
                    # the switch so nothing boots old auth concurrently.
                    $guardedGuard = Enter-BackendStartGuard -MutexName $BackendStartMutexName -WaitMs $BackendStartWaitMs
                    $reGuard=Assert-NoGhostBeforeMutation $bridgeDir $Seams
                    if($null -eq $reGuard -or $reGuard.verdict -ne 'free'){throw 'Owned backend identity changed while acquiring the startup guard; nothing was switched.'}
                    try{
                        Switch-CodexAuth $plan.Account $Seams
                    }catch{
                        $switchError=$_
                        Exit-BackendStartGuard -Guard $guardedGuard
                        try{ & $Seams.EnsureBackend; & $Seams.OpenSharedApps }catch{}
                        throw $switchError
                    }
                    Exit-BackendStartGuard -Guard $guardedGuard
                    & $Seams.EnsureBackend
                }else{
                # Idle-verified stop BEFORE the switch: the backend must
                # never reboot on the old auth. The idle proof from the
                # guarded wait above keeps this conservative. The shared
                # backend-start mutex is held across stop+switch so no
                # KeepAlive/startup Ensure can boot the old auth in
                # between; it is released before any child Ensure/Open.
                $guardedGuard = Enter-BackendStartGuard -MutexName $BackendStartMutexName -WaitMs $BackendStartWaitMs
                # Revalidate after the guard wait: the backend may have
                # changed hands while waiting. Refusals throw before the
                # idle stop; a benign already-exit is tolerated downstream.
                Assert-NoGhostBeforeMutation $bridgeDir $Seams | Out-Null
                try{
                    try{
                        & $Seams.StopBackendIdle $bridgeDir $sharedSettings
                    }catch{
                        $idleStopError=$_
                        Exit-BackendStartGuard -Guard $guardedGuard
                        try{ & $Seams.EnsureBackend; & $Seams.OpenSharedApps }catch{}
                        throw $idleStopError
                    }
                    try{
                        Switch-CodexAuth $plan.Account $Seams
                    }catch{
                        $switchError=$_
                        Exit-BackendStartGuard -Guard $guardedGuard
                        try{ & $Seams.EnsureBackend; & $Seams.OpenSharedApps }catch{}
                        throw $switchError
                    }
                }finally{
                    Exit-BackendStartGuard -Guard $guardedGuard
                }
                & $Seams.EnsureBackend
                }
            }else{
                # Revalidate before the idle restart (same guard-wait rule).
                Assert-NoGhostBeforeMutation $bridgeDir $Seams | Out-Null
                & $Seams.RestartIdleBackend
            }
        }else{
            # Force: the old shared native is still on the old auth and can
            # cache/rotate it, so the exact owned supervisor+native quiesce
            # (no respawn) happens BEFORE any auth switch — and the backend
            # boots exactly ONCE afterwards. Booting before the switch would
            # reload the old profile, and the post-switch boot would then
            # see ready and change nothing: stop OLD backend, switch (if
            # requested), Ensure ONCE, open. No-account restarts Ensure
            # once as well. Stop/switch failures restore separately below.
            # Positive already-stopped proof skips the gen-check (no live
            # status exists to fetch — fetching it is exactly what must
            # NOT boot the old auth) and skips the backend stop itself:
            # switch (if requested) straight to the single boot.
            if($alreadyStopped){
                if($null -eq $plan.Account){
                    & $Seams.EnsureBackend
                    & $Seams.OpenSharedApps
                    Write-Host 'Codex Desktop is connected to the shared Paseo backend.' -ForegroundColor Green
                    return
                }
                $bareGuard = Enter-BackendStartGuard -MutexName $BackendStartMutexName -WaitMs $BackendStartWaitMs
                $reBare=Assert-NoGhostBeforeMutation $bridgeDir $Seams
                if($null -eq $reBare -or $reBare.verdict -ne 'free'){throw 'Owned backend identity changed while acquiring the startup guard; nothing was switched.'}
                try{
                    Switch-CodexAuth $plan.Account $Seams
                }catch{
                    $switchError=$_
                    Exit-BackendStartGuard -Guard $bareGuard
                    try{ & $Seams.EnsureBackend; & $Seams.OpenSharedApps }catch{}
                    throw $switchError
                }
                Exit-BackendStartGuard -Guard $bareGuard
                & $Seams.EnsureBackend
                & $Seams.OpenSharedApps
                Write-Host 'Codex Desktop is connected to the shared Paseo backend.' -ForegroundColor Green
                return
            }
            $record=& $Seams.ReadBridgeJson 'service.private.json'
            $live=& $Seams.RestStatus
            # Generation must match exactly; state may be ready OR failed
            # (a proven failed backend is stopped directly, never rebooted
            # first). Any other state, or an unreachable status with a live
            # owned runtime, refuses — the earlier gates already proved the
            # failed/already-stopped cases that may proceed.
            if($record.generation -ne $live.backend.generation){throw 'Backend changed before the manual restart.'}
            if($live.backend.state -ne 'ready' -and $live.backend.state -ne 'failed'){throw 'Backend changed before the manual restart.'}
            # The shared backend-start mutex is held across the exact
            # stop+switch interval so no KeepAlive/startup Ensure can boot
            # the OLD auth in between; it is released before the single
            # post-switch boot and before any failure restore (those run
            # child Ensure/Open processes, which would deadlock on a hold).
            $forceGuard = Enter-BackendStartGuard -MutexName $BackendStartMutexName -WaitMs $BackendStartWaitMs
            # Revalidate after the guard wait (same rule as above).
            Assert-NoGhostBeforeMutation $bridgeDir $Seams | Out-Null
            try{
                try{
                    & $Seams.StopBackendForced $bridgeDir $sharedSettings
                }catch{
                    $backendError=$_
                    Exit-BackendStartGuard -Guard $forceGuard
                    try{ & $Seams.EnsureBackend }catch{}
                    throw $backendError
                }
                if($null -ne $plan.Account){
                    try{
                        Switch-CodexAuth $plan.Account $Seams
                    }catch{
                        $switchError=$_
                        Exit-BackendStartGuard -Guard $forceGuard
                        try{ & $Seams.EnsureBackend; & $Seams.OpenSharedApps }catch{}
                        throw $switchError
                    }
                }
            }finally{
                Exit-BackendStartGuard -Guard $forceGuard
            }
            & $Seams.EnsureBackend
        }
        & $Seams.OpenSharedApps
        Write-Host 'Codex Desktop is connected to the shared Paseo backend.' -ForegroundColor Green
        return
    }
    if(($null -ne $plan.Account) -and -not $sharedMode){
        # Non-shared mode only: stop-then-switch so no cached token
        # survives the relaunch.
        Switch-CodexAuth $plan.Account $Seams
    }
    $aumid = Resolve-ChatGptDesktopAumid $Seams
    Write-Host "Launching new ChatGPT desktop app ('$aumid') ..." -ForegroundColor Cyan
    & $Seams.StartProc "shell:AppsFolder\$aumid"
    Write-Host "Done. The app re-read ~/.codex/auth.json on startup." -ForegroundColor Green
    }finally{
        $restartGuard.ReleaseMutex();$restartGuard.Dispose()
    }
}

# Named arguments only: positional binding of $false into [switch] beside a
# trailing negative literal mis-binds on some hosts (verified by fixture),
# so every internal call site uses names.
if($MyInvocation.InvocationName -ne '.'){ Invoke-CodexApp -Target $Target -TargetAccount $TargetAccount -Account $Account -NoStop:$NoStop -StopOnly:$StopOnly -WaitSeconds $WaitSeconds -MutexName $MutexName -BridgeDirOverride $BridgeDirOverride -BackendStartMutexName $BackendStartMutexName -BackendStartWaitMs $BackendStartWaitMs -Seams $null }
