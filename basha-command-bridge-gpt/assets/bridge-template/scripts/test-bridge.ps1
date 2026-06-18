$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SetupScript = Join-Path $PSScriptRoot "setup.ps1"
$StartScript = Join-Path $PSScriptRoot "start-bridge.ps1"
$StopScript = Join-Path $PSScriptRoot "stop-bridge.ps1"
$EnvPath = Join-Path $ProjectRoot ".env"
$Port = 8765
$BaseUrl = "http://127.0.0.1:$Port"
$StartedByTest = $false

function Get-BridgeSecret {
    $line = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match "^\s*BRIDGE_SECRET\s*=" } | Select-Object -First 1
    if (-not $line) { throw "BRIDGE_SECRET missing from .env" }
    return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

function Invoke-Bridge {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    $headers = @{ Authorization = "Bearer $script:Secret" }
    $uri = "$BaseUrl$Path"
    if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
    }
    $json = $Body | ConvertTo-Json -Depth 12
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body $json
}

function Wait-JobDone {
    param([string]$JobId, [int]$MaxSeconds = 20)
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    do {
        $job = Invoke-Bridge -Method "GET" -Path "/commands/$JobId"
        if (@("succeeded", "failed", "timed_out", "cancelled", "error") -contains $job.status) {
            return $job
        }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    throw "Job $JobId did not finish within $MaxSeconds seconds"
}

& $SetupScript
$script:Secret = Get-BridgeSecret

try {
    Invoke-Bridge -Method "GET" -Path "/health" | Out-Null
} catch {
    & $StartScript -Detached -HostName "127.0.0.1" -Port $Port
    $StartedByTest = $true
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            Invoke-Bridge -Method "GET" -Path "/health" | Out-Null
            $ready = $true
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) { throw "Bridge did not become ready at $BaseUrl" }
}

$health = Invoke-Bridge -Method "GET" -Path "/health"
Write-Host "Health OK: $($health.service) / $($health.gptName)"

$who = Invoke-Bridge -Method "POST" -Path "/commands/start" -Body @{ command = "whoami; Get-Location"; shell = "powershell"; timeoutSec = 10 }
$whoDone = Wait-JobDone -JobId $who.id
if ($whoDone.status -ne "succeeded") { throw "whoami command failed: $($whoDone.stderr)" }
Write-Host "Command OK: $($whoDone.stdout.Trim())"

$testDir = Join-Path $env:TEMP ("basha-bridge-test-" + [Guid]::NewGuid().ToString("N"))
$filePath = Join-Path $testDir "sample.txt"

Invoke-Bridge -Method "POST" -Path "/files/write" -Body @{ path = $filePath; content = "hello"; createParents = $true; overwrite = $true } | Out-Null
Invoke-Bridge -Method "POST" -Path "/files/append" -Body @{ path = $filePath; content = "`nworld" } | Out-Null
$read = Invoke-Bridge -Method "POST" -Path "/files/read" -Body @{ path = $filePath; maxBytes = 1000 }
if ($read.content -notmatch "hello" -or $read.content -notmatch "world") { throw "file read/write/append failed" }
Write-Host "File write/read/append OK: $filePath"

$replace = Invoke-Bridge -Method "POST" -Path "/files/replace" -Body @{
    path = $filePath
    replacements = @(@{ old = "world"; new = "bridge"; count = -1 })
}
if ($replace.replacements[0].replaced -ne 1) { throw "file replace failed" }
Write-Host "File replace OK"

$search = Invoke-Bridge -Method "POST" -Path "/files/search" -Body @{ root = $testDir; pattern = "*.txt"; text = "bridge"; maxResults = 10 }
if ($search.matches.Count -lt 1) { throw "file search failed" }
Write-Host "File search OK"

$timeout = Invoke-Bridge -Method "POST" -Path "/commands/start" -Body @{ command = "Start-Sleep -Seconds 5; 'late'"; shell = "powershell"; timeoutSec = 1 }
$timeoutDone = Wait-JobDone -JobId $timeout.id -MaxSeconds 10
if ($timeoutDone.status -ne "timed_out") { throw "timeout failed, got $($timeoutDone.status)" }
Write-Host "Timeout OK"

$long = Invoke-Bridge -Method "POST" -Path "/commands/start" -Body @{ command = "Start-Sleep -Seconds 20; 'done'"; shell = "powershell"; timeoutSec = 60 }
Start-Sleep -Milliseconds 600
Invoke-Bridge -Method "POST" -Path "/commands/$($long.id)/cancel" | Out-Null
$cancelDone = Wait-JobDone -JobId $long.id -MaxSeconds 10
if ($cancelDone.status -ne "cancelled") { throw "cancel failed, got $($cancelDone.status)" }
Write-Host "Cancel OK"

Invoke-Bridge -Method "POST" -Path "/files/delete" -Body @{ path = $testDir; recursive = $true; missingOk = $false } | Out-Null
if (Test-Path $testDir) { throw "delete failed: $testDir still exists" }
Write-Host "Delete OK"

Write-Host "All bridge tests passed."

if ($StartedByTest) {
    & $StopScript
}
