[CmdletBinding()]
param(
    [switch]$Apply,
    [int]$MaxFavorites = 20,
    [string]$RelayHome = "$env:USERPROFILE\.relay-ai"
)

$ErrorActionPreference = 'Stop'
$configPath = Join-Path $RelayHome 'config.json'
$providersPath = Join-Path $RelayHome 'providers.json'

if (-not (Test-Path -LiteralPath $providersPath)) {
    throw "Provider registry not found. Run 'relay-ai providers refresh-models go' first."
}

$providers = Get-Content -LiteralPath $providersPath -Raw | ConvertFrom-Json
$go = @($providers.providers | Where-Object { $_.id -eq 'go' -and $_.enabled -ne $false }) | Select-Object -First 1
if (-not $go) {
    throw 'Enabled OpenCode Go provider not found.'
}

$liveIds = @($go.modelsCache.models | ForEach-Object { $_.id } | Where-Object { $_ })
if ($liveIds.Count -eq 0) {
    throw 'OpenCode Go has no cached models. Refresh the provider first.'
}
if ($liveIds.Count -gt $MaxFavorites) {
    throw "Go exposes $($liveIds.Count) models, exceeding the $MaxFavorites-model favorites cap. Refusing to truncate."
}
foreach ($required in @('glm-5.2', 'qwen3.7-plus')) {
    if ($required -notin $liveIds) {
        throw "Required model is missing from the live Go catalog: $required"
    }
}

$orderedIds = @('glm-5.2', 'qwen3.7-plus') + @($liveIds | Where-Object { $_ -notin @('glm-5.2', 'qwen3.7-plus') })
$config = if (Test-Path -LiteralPath $configPath) {
    Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
} else {
    [pscustomobject]@{}
}

$current = @($config.favoriteModels | Where-Object { $_.providerId -eq 'go' } | ForEach-Object { $_.modelId })
$missing = @($orderedIds | Where-Object { $_ -notin $current })
$extra = @($current | Where-Object { $_ -notin $orderedIds })
$duplicates = @($current | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })

$before = [pscustomobject]@{
    LiveCount = $orderedIds.Count
    FavoriteCount = $current.Count
    Missing = $missing
    Extra = $extra
    Duplicates = $duplicates
    First = if ($current.Count -gt 0) { $current[0] } else { $null }
    Second = if ($current.Count -gt 1) { $current[1] } else { $null }
}

if (-not $Apply) {
    [pscustomobject]@{ Applied = $false; State = $before; Desired = $orderedIds } | ConvertTo-Json -Depth 5
    return
}

$backupPath = $null
if (Test-Path -LiteralPath $configPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = "$configPath.bak.$stamp"
    Copy-Item -LiteralPath $configPath -Destination $backupPath
}

$favorites = @($orderedIds | ForEach-Object {
    [pscustomobject]@{ providerId = 'go'; modelId = $_ }
})

$config | Add-Member -NotePropertyName favoriteModels -NotePropertyValue $favorites -Force
$config | Add-Member -NotePropertyName lastProvider -NotePropertyValue 'go' -Force
$config | Add-Member -NotePropertyName lastModel -NotePropertyValue 'glm-5.2' -Force
$config | Add-Member -NotePropertyName lastCodexProvider -NotePropertyValue 'go' -Force
$config | Add-Member -NotePropertyName lastCodexModel -NotePropertyValue 'glm-5.2' -Force

$parent = Split-Path -Parent $configPath
if (-not (Test-Path -LiteralPath $parent)) {
    [void](New-Item -ItemType Directory -Path $parent -Force)
}
$config | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $configPath -Encoding utf8

$saved = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$savedIds = @($saved.favoriteModels | Where-Object { $_.providerId -eq 'go' } | ForEach-Object { $_.modelId })
$valid = $savedIds.Count -eq $orderedIds.Count -and
    @($orderedIds | Where-Object { $_ -notin $savedIds }).Count -eq 0 -and
    @($savedIds | Where-Object { $_ -notin $orderedIds }).Count -eq 0 -and
    @($savedIds | Group-Object | Where-Object { $_.Count -gt 1 }).Count -eq 0 -and
    $savedIds[0] -eq 'glm-5.2' -and
    $savedIds[1] -eq 'qwen3.7-plus'

if (-not $valid) {
    throw "Favorites verification failed. Restore from backup: $backupPath"
}

[pscustomobject]@{
    Applied = $true
    BackupPath = $backupPath
    LiveCount = $orderedIds.Count
    FavoriteCount = $savedIds.Count
    First = $savedIds[0]
    Second = $savedIds[1]
    Missing = @()
    Extra = @()
    Duplicates = @()
} | ConvertTo-Json -Depth 5

