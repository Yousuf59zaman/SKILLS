[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'
$relayRoot = "$env:APPDATA\npm\node_modules\@jacobbd\relay-ai"
$relayHome = "$env:USERPROFILE\.relay-ai"
$configPath = Join-Path $relayHome 'config.json'
$providersPath = Join-Path $relayHome 'providers.json'
$credentialScript = Join-Path $PSScriptRoot 'manage-opencode-go-credential.ps1'

function Invoke-Version([string]$command, [string[]]$arguments) {
    try {
        $value = & $command @arguments 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        ($value | Out-String).Trim()
    }
    catch { $null }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$pkg = Get-AppxPackage -Name Claude
$claudeExe = $null
$claudeSignature = $null
if ($pkg) {
    $claudeExe = Get-ChildItem -LiteralPath $pkg.InstallLocation -Filter 'Claude.exe' -Recurse -File | Select-Object -First 1 -ExpandProperty FullName
    if ($claudeExe) { $claudeSignature = (Get-AuthenticodeSignature -LiteralPath $claudeExe).Status.ToString() }
}

$config = if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } else { $null }
$providers = if (Test-Path -LiteralPath $providersPath) { Get-Content -LiteralPath $providersPath -Raw | ConvertFrom-Json } else { $null }
$go = @($providers.providers | Where-Object { $_.id -eq 'go' }) | Select-Object -First 1
$goIds = @($go.modelsCache.models | ForEach-Object { $_.id })
$favoriteIds = @($config.favoriteModels | Where-Object { $_.providerId -eq 'go' } | ForEach-Object { $_.modelId })

$environment = foreach ($name in @('OPENCODE_API_KEY', 'RELAY_AI_KEY_GO', 'RELAY_AI_KEY_ZEN')) {
    foreach ($scope in @('Process', 'User', 'Machine')) {
        $value = [Environment]::GetEnvironmentVariable($name, $scope)
        [pscustomobject]@{ Name = $name; Scope = $scope; Present = -not [string]::IsNullOrWhiteSpace($value) }
    }
}

$keyring = $null
if ((Test-Path -LiteralPath $credentialScript) -and (Test-Path -LiteralPath $relayRoot) -and (Get-Command node)) {
    try {
        $keyring = powershell -NoProfile -ExecutionPolicy Bypass -File $credentialScript -Action Audit | ConvertFrom-Json
    }
    catch { $keyring = [pscustomobject]@{ Error = 'Keyring audit failed without exposing credential data.' } }
}

[pscustomobject]@{
    OS = [Environment]::OSVersion.VersionString
    Architecture = $env:PROCESSOR_ARCHITECTURE
    Administrator = $isAdmin
    Node = Invoke-Version 'node' @('--version')
    Npm = Invoke-Version 'npm.cmd' @('--version')
    Relay = Invoke-Version "$env:APPDATA\npm\relay-ai.cmd" @('--version')
    Codex = Invoke-Version "$env:APPDATA\npm\codex.cmd" @('--version')
    Claude = [pscustomobject]@{
        Package = $pkg.PackageFullName
        Status = if ($pkg) { $pkg.Status.ToString() } else { $null }
        Executable = $claudeExe
        Signature = $claudeSignature
        LegacyFolderPresent = Test-Path -LiteralPath "$env:LOCALAPPDATA\AnthropicClaude"
        ProfilePresent = Test-Path -LiteralPath "$env:APPDATA\Claude"
        ProcessCount = @(Get-Process -Name Claude).Count
    }
    Go = [pscustomobject]@{
        Enabled = if ($go) { $go.enabled -ne $false } else { $false }
        ModelCount = $goIds.Count
        FavoriteCount = $favoriteIds.Count
        DefaultProvider = $config.lastProvider
        DefaultModel = $config.lastModel
        MissingFavorites = @($goIds | Where-Object { $_ -notin $favoriteIds })
        ExtraFavorites = @($favoriteIds | Where-Object { $_ -notin $goIds })
        Duplicates = @($favoriteIds | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
    }
    Keyring = $keyring
    Environment = @($environment)
} | ConvertTo-Json -Depth 8

