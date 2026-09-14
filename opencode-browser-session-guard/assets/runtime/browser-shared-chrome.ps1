param(
    [string]$ProfilePath,
    [ValidateRange(1024, 65535)][int]$Port = 9222,
    [string]$ChromePath,
    [switch]$Headless
)
$ErrorActionPreference = 'Stop'
if (-not $ProfilePath) {
    $settingsPath = Join-Path $PSScriptRoot 'browser-shared-chrome.settings.json'
    if (-not (Test-Path -LiteralPath $settingsPath)) { throw 'Shared Chrome settings are missing.' }
    $ProfilePath = (Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json).profilePath
}
$ProfilePath = [IO.Path]::GetFullPath($ProfilePath).TrimEnd('\')
if (-not $ChromePath) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
    )
    $ChromePath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $ChromePath -or -not (Test-Path -LiteralPath $ChromePath)) { throw 'Google Chrome executable was not found.' }
$normalizedProfile = $ProfilePath.ToLowerInvariant()
$hash = [Security.Cryptography.SHA256]::Create()
try { $mutexSuffix = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalizedProfile)))).Replace('-', '') } finally { $hash.Dispose() }
$mutex = New-Object Threading.Mutex($false, "Local\OpenCodeSharedChrome-$mutexSuffix")
$acquired = $false
function Get-ProfileOwners {
    @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
        if ($_.CommandLine -match '--type=') { return $false }
        $match = [regex]::Match($_.CommandLine, '(?i)--user-data-dir(?:=|\s+)(?:"([^"]+)"|(\S+))')
        if (-not $match.Success) { return $false }
        $candidate = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
        try { return [IO.Path]::GetFullPath($candidate).TrimEnd('\').Equals($ProfilePath, [StringComparison]::OrdinalIgnoreCase) } catch { return $false }
    })
}
function Test-EndpointIdentity {
    param($Owners)
    $listener = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listener.Count -eq 0) { return $false }
    if (@($listener | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }).Count) { throw 'The debugging port is not restricted to loopback.' }
    if (@($listener | Where-Object { $_.OwningProcess -notin @($Owners.ProcessId) }).Count) { throw 'The debugging port belongs to a different process/profile. Existing browsers were left running.' }
    try { $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 } catch { return $false }
    if (-not $version.Browser -or -not $version.webSocketDebuggerUrl) { throw 'The debugging endpoint returned invalid Chrome metadata.' }
    $websocketUri = [uri]$version.webSocketDebuggerUrl
    if ($websocketUri.Host -notin @('127.0.0.1','localhost','::1','[::1]') -or $websocketUri.Port -ne $Port) { throw 'The debugging endpoint returned an unexpected websocket address.' }
    return $true
}
try {
    try { $acquired = $mutex.WaitOne(25000) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Timed out waiting for another shared Chrome launch to finish.' }
    $owners = @(Get-ProfileOwners)
    if (Test-EndpointIdentity $owners) { Write-Output 'Shared Chrome ready.'; exit 0 }
    if ($owners.Count) { throw 'The shared profile is already open without a healthy debugging endpoint. Save work and close that profile once, then retry. No browser was stopped.' }
    $launchArgs = @("--user-data-dir=`"$ProfilePath`"", "--remote-debugging-port=$Port", '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check')
    if ($Headless) { $launchArgs += @('--headless=new', '--disable-extensions', '--disable-background-networking') }
    $launchArgs += 'about:blank'
    $null = Start-Process -FilePath $ChromePath -ArgumentList $launchArgs -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 250
        $owners = @(Get-ProfileOwners)
        if (Test-EndpointIdentity $owners) { Write-Output 'Shared Chrome started and verified.'; exit 0 }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Chrome did not expose its debugging endpoint within 20 seconds.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
