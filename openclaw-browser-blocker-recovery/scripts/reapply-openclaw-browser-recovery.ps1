[CmdletBinding()]
param(
    [int]$CdpPort = 18801,
    [string]$BrowserProfile = "openclaw",
    [switch]$SkipRuntimePatch,
    [switch]$SkipBrowserStart
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

function Backup-DeviceState([string]$DevicesDir, [string]$BackupRoot) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $BackupRoot "devices-$stamp"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -Path (Join-Path $DevicesDir "*") -Destination $backupDir -Force -ErrorAction SilentlyContinue
    return $backupDir
}

function Normalize-DeviceJson([string]$DevicesDir) {
    $pendingPath = Join-Path $DevicesDir "pending.json"
    $pairedPath = Join-Path $DevicesDir "paired.json"

    Get-ChildItem -Path $DevicesDir -Filter "*.tmp" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Set-Content -Path $pendingPath -Value "{}" -Encoding utf8

    if (-not (Test-Path $pairedPath)) {
        Set-Content -Path $pairedPath -Value "{}" -Encoding utf8
        return
    }

    try {
        # Validate only; do not rewrite valid paired.json to avoid touching live tokens.
        Get-Content -Raw -Path $pairedPath | ConvertFrom-Json -ErrorAction Stop | Out-Null
    } catch {
        Warn "paired.json was invalid; resetting to empty object."
        Set-Content -Path $pairedPath -Value "{}" -Encoding utf8
    }
}

function Patch-RenameRetry {
    $dist = Join-Path $env:APPDATA "npm\node_modules\openclaw\dist"
    if (-not (Test-Path $dist)) {
        throw "OpenClaw dist directory not found: $dist"
    }

    $helper = @'
async function renameWithRetry(fsApi, tmp, filePath) {
	for (let attempt = 0; ; attempt++) try {
		await fsApi.rename(tmp, filePath);
		return;
	} catch (err) {
		const code = err?.code;
		const retryable = code === "EPERM" || code === "EACCES" || code === "EBUSY" || code === "EEXIST";
		if (!retryable || attempt >= 8) throw err;
		try {
			await fsApi.rm(filePath, { force: true });
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
	}
}
'@

    $candidates = Get-ChildItem -Path $dist -Recurse -File -Filter "*.js" | Where-Object {
        $content = Get-Content -Raw -Path $_.FullName
        $content -match 'pendingPath:\s*path\.join\(dir,\s*"pending\.json"\)' -and
        $content -match 'async function writeJsonAtomic\(filePath,\s*value,\s*options\)'
    }

    $patched = 0
    $scanned = 0

    foreach ($file in $candidates) {
        $scanned++
        $content = Get-Content -Raw -Path $file.FullName
        $updated = $false

        $fsVar = $null
        if ($content -match 'await fs\$1\.rename\(tmp,\s*filePath\);') {
            $fsVar = 'fs$1'
        } elseif ($content -match 'await fs\.rename\(tmp,\s*filePath\);') {
            $fsVar = 'fs'
        } else {
            continue
        }

        if ($content -notmatch 'async function renameWithRetry\(fsApi, tmp, filePath\)') {
            $content = $content -replace 'async function writeJsonAtomic\(filePath,\s*value,\s*options\) \{', ($helper + "`r`nasync function writeJsonAtomic(filePath, value, options) {")
            $updated = $true
        }

        if ($fsVar -eq 'fs$1') {
            $newContent = $content -replace 'await fs\$1\.rename\(tmp,\s*filePath\);', 'await renameWithRetry(fs$1, tmp, filePath);'
        } else {
            $newContent = $content -replace 'await fs\.rename\(tmp,\s*filePath\);', 'await renameWithRetry(fs, tmp, filePath);'
        }

        if ($newContent -ne $content) {
            $content = $newContent
            $updated = $true
        }

        if ($updated) {
            Copy-Item -Path $file.FullName -Destination ($file.FullName + ".bak-codex") -Force
            Set-Content -Path $file.FullName -Value $content -Encoding utf8
            $patched++
        }
    }

    Ok "Runtime patch scan complete (scanned=$scanned, patched=$patched)."
}

function Show-RecentCriticalLogLines {
    $candidateDirs = @(
        (Join-Path $env:TEMP "openclaw"),
        "C:\tmp\openclaw"
    )
    $today = Get-Date -Format "yyyy-MM-dd"
    $logPath = $null
    foreach ($dir in $candidateDirs) {
        $candidate = Join-Path $dir "openclaw-$today.log"
        if (Test-Path $candidate) {
            $logPath = $candidate
            break
        }
    }
    if (-not $logPath) {
        Warn "No log found in: $($candidateDirs -join ', ')"
        return
    }

    Step "Recent critical log lines"
    Select-String -Path $logPath -Pattern "parse/handle error|EPERM|gateway closed \(1000\)|browser failed" |
        Select-Object -Last 20 |
        ForEach-Object { $_.Line }
}

function Get-GatewayStatusObject {
    try {
        $json = openclaw gateway status --json
        return ($json | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        Warn "Unable to parse gateway status JSON: $($_.Exception.Message)"
        return $null
    }
}

Ensure-OpenClawCli

$stateDir = Join-Path $env:USERPROFILE ".openclaw"
$devicesDir = Join-Path $stateDir "devices"
$backupRoot = Join-Path $stateDir "_backup"

if (-not (Test-Path $devicesDir)) {
    throw "Devices directory not found: $devicesDir"
}

Step "Stopping gateway"
try {
    openclaw gateway stop | Out-Host
} catch {
    Warn "Gateway stop reported an error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2

Step "Backing up and cleaning device state"
$backupDir = Backup-DeviceState -DevicesDir $devicesDir -BackupRoot $backupRoot
Normalize-DeviceJson -DevicesDir $devicesDir
Ok "Device backup saved to $backupDir"

Step "Applying browser CDP port config"
openclaw config set browser.profiles.openclaw.cdpPort $CdpPort | Out-Host
openclaw config set browser.profiles.chrome.cdpPort $CdpPort | Out-Host
openclaw config get browser.profiles.openclaw.cdpPort | Out-Host

if (-not $SkipRuntimePatch) {
    Step "Applying Windows rename retry runtime patch"
    Patch-RenameRetry
} else {
    Warn "Skipping runtime patch by request."
}

Step "Restarting gateway"
openclaw gateway start | Out-Host
Start-Sleep -Seconds 2
$gatewayStatus = Get-GatewayStatusObject
if ($gatewayStatus) {
    $gatewayStatus | ConvertTo-Json -Depth 100 | Out-Host
}

if (-not $SkipBrowserStart -and $gatewayStatus -and $gatewayStatus.rpc.ok -eq $true) {
    Step "Starting browser profile"
    try {
        openclaw browser --browser-profile $BrowserProfile --json start | Out-Host
    } catch {
        Warn "Browser start failed: $($_.Exception.Message)"
    }

    Step "Running browser smoke test"
    try {
        openclaw browser --browser-profile $BrowserProfile --json open https://example.com | Out-Host
        $snapshot = openclaw browser --browser-profile $BrowserProfile --json snapshot --efficient --limit 120
        $snapshotObj = $snapshot | ConvertFrom-Json -ErrorAction Stop
        if ($snapshotObj.PSObject.Properties.Name -contains "refs" -and $snapshotObj.refs) {
            $firstRef = $snapshotObj.refs.PSObject.Properties | Select-Object -First 1
            if ($firstRef) {
                openclaw browser --browser-profile $BrowserProfile --json click $firstRef.Name | Out-Host
            } else {
                Warn "No clickable refs found in snapshot."
            }
        } else {
            Warn "Snapshot did not return refs; skipping click test."
        }
        openclaw browser --browser-profile $BrowserProfile --json tabs | Out-Host
    } catch {
        Warn "Browser smoke test failed: $($_.Exception.Message)"
    }
} elseif (-not $SkipBrowserStart) {
    Warn "Skipping browser smoke test because gateway RPC is not healthy (pairing or auth issue)."
} else {
    Warn "Skipping browser start/smoke test by request."
}

Show-RecentCriticalLogLines
Ok "OpenClaw browser blocker recovery completed."
