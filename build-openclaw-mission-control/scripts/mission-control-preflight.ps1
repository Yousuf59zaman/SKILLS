[CmdletBinding()]
param(
    [string]$ProjectPath = "",
    [string]$OpenClawRoot = (Join-Path $env:USERPROFILE ".openclaw"),
    [int]$BridgePort = 18790
)

$ErrorActionPreference = "Stop"

function Get-CommandState {
    param([Parameter(Mandatory)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    [pscustomobject]@{
        Check = "command:$Name"
        Ready = [bool]$command
        Detail = if ($command) { "available" } else { "missing" }
    }
}

function Test-ProjectFile {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$RelativePath
    )

    [pscustomobject]@{
        Check = "project:$RelativePath"
        Ready = Test-Path -LiteralPath (Join-Path $Root $RelativePath)
        Detail = "presence only"
    }
}

$results = [System.Collections.Generic.List[object]]::new()

foreach ($name in @("node", "pnpm", "git", "gh", "vercel", "tailscale", "openclaw", "rg")) {
    $results.Add((Get-CommandState -Name $name))
}

$results.Add([pscustomobject]@{
    Check = "openclaw:state-root"
    Ready = Test-Path -LiteralPath $OpenClawRoot
    Detail = if (Test-Path -LiteralPath $OpenClawRoot) { "present" } else { "missing" }
})

$version = "unavailable"
if (Get-Command openclaw -ErrorAction SilentlyContinue) {
    try {
        $version = ((& openclaw --version 2>$null | Select-Object -First 1) -join "").Trim()
        if (-not $version) { $version = "available" }
    } catch {
        $version = "command failed"
    }
}
$results.Add([pscustomobject]@{
    Check = "openclaw:version"
    Ready = $version -notin @("unavailable", "command failed")
    Detail = $version
})

$listener = Get-NetTCPConnection `
    -LocalAddress "127.0.0.1" `
    -LocalPort $BridgePort `
    -State Listen `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1
$results.Add([pscustomobject]@{
    Check = "bridge:loopback-listener"
    Ready = [bool]$listener
    Detail = if ($listener) { "listening on configured loopback port" } else { "not listening" }
})

$task = Get-ScheduledTask -TaskName "OpenClaw Mission Control Bridge" -ErrorAction SilentlyContinue
$results.Add([pscustomobject]@{
    Check = "bridge:scheduled-task"
    Ready = [bool]$task
    Detail = if ($task) { [string]$task.State } else { "not installed" }
})

if ($ProjectPath) {
    $resolvedProject = Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop
    foreach ($file in @(
        "package.json",
        "pnpm-lock.yaml",
        ".env.example",
        "auth.ts",
        "lib\bridge-client.ts",
        "bridge\server.mjs",
        "bridge\chat-service.mjs",
        "bridge\capability-service.mjs",
        "scripts\install-bridge.ps1"
    )) {
        $results.Add((Test-ProjectFile -Root $resolvedProject.Path -RelativePath $file))
    }

    $results.Add([pscustomobject]@{
        Check = "project:local-web-env"
        Ready = Test-Path -LiteralPath (Join-Path $resolvedProject.Path ".env.local")
        Detail = "presence only; values not read"
    })
    $results.Add([pscustomobject]@{
        Check = "project:local-bridge-env"
        Ready = Test-Path -LiteralPath (Join-Path $resolvedProject.Path ".env.bridge")
        Detail = "presence only; values not read"
    })

    if (Test-Path -LiteralPath (Join-Path $resolvedProject.Path ".git")) {
        $branch = (& git -C $resolvedProject.Path branch --show-current 2>$null).Trim()
        $dirty = [bool](& git -C $resolvedProject.Path status --short 2>$null)
        $results.Add([pscustomobject]@{
            Check = "project:git"
            Ready = -not $dirty
            Detail = "branch=$branch; clean=$(-not $dirty)"
        })
    }
}

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { -not $_.Ready })
Write-Output ""
Write-Output ("Preflight: {0} ready, {1} attention. No secret values were read." -f ($results.Count - $failed.Count), $failed.Count)

if ($failed.Count -gt 0) {
    exit 2
}
