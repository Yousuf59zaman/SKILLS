[CmdletBinding()]
param(
    [string]$BridgeRoot = (Join-Path $env:USERPROFILE 'chatgpt-command-bridge'),
    [string]$PublicUrl,
    [switch]$RequireFigma
)

$ErrorActionPreference = 'Stop'

function Read-EnvMap {
    param([Parameter(Mandatory = $true)][string]$Path)

    $map = @{}
    Get-Content -LiteralPath $Path | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
            $map[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    return $map
}

function Get-OpenApiOperations {
    param([Parameter(Mandatory = $true)]$Schema)

    $operations = @()
    foreach ($pathProperty in $Schema.paths.PSObject.Properties) {
        foreach ($methodProperty in $pathProperty.Value.PSObject.Properties) {
            if ($methodProperty.Name -in @('get', 'post', 'put', 'patch', 'delete')) {
                $operations += $methodProperty.Value
            }
        }
    }
    return @($operations)
}

$envFile = Join-Path $BridgeRoot '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Office bridge environment file was not found: $envFile"
}

$envMap = Read-EnvMap -Path $envFile
$token = $envMap['BRIDGE_TOKEN']
if (-not $token) {
    throw 'BRIDGE_TOKEN is missing from the Office bridge environment.'
}

$hostName = if ($envMap['BRIDGE_HOST']) { $envMap['BRIDGE_HOST'] } else { '127.0.0.1' }
$port = if ($envMap['BRIDGE_PORT']) { [int]$envMap['BRIDGE_PORT'] } else { 8787 }
if (-not $PublicUrl) { $PublicUrl = $envMap['PUBLIC_BASE_URL'] }

$headers = @{ Authorization = "Bearer $token" }
$localBase = "http://${hostName}:$port"
$health = Invoke-RestMethod -Method Get -Uri "$localBase/health" -Headers $headers -TimeoutSec 10
$status = Invoke-RestMethod -Method Get -Uri "$localBase/integrations/status" -Headers $headers -TimeoutSec 40

$schemaReachable = $false
$operationCount = 0
$officeIntegrationPresent = $false
$allNonConsequential = $false
if ($PublicUrl) {
    $schema = Invoke-RestMethod -Method Get -Uri "$($PublicUrl.TrimEnd('/'))/openapi.json" -TimeoutSec 20
    $operations = Get-OpenApiOperations -Schema $schema
    $operationCount = $operations.Count
    $officeIntegrationPresent = $operations.operationId -contains 'officeIntegration'
    $allNonConsequential = @($operations | Where-Object { $_.'x-openai-isConsequential' -ne $false }).Count -eq 0
    $schemaReachable = $true
}

$figmaConfigured = [bool]$status.figma.configured
$result = [ordered]@{
    bridgeHealth = $health.status
    localhostOnly = $hostName -eq '127.0.0.1'
    chromeRunning = [bool]$status.chrome.running
    githubConfigured = [bool]$status.github.configured
    postmanConfigured = [bool]$status.postman.configured
    figmaConfigured = $figmaConfigured
    figmaRequired = [bool]$RequireFigma
    googleApps = @($status.googleWorkspace.apps)
    publicSchemaReachable = $schemaReachable
    operationCount = $operationCount
    officeIntegrationPresent = $officeIntegrationPresent
    allNonConsequential = $allNonConsequential
}

$result | ConvertTo-Json -Depth 5

$coreOk = (
    $health.status -eq 'ok' -and
    $result.localhostOnly -and
    $result.chromeRunning -and
    $result.githubConfigured -and
    $result.postmanConfigured -and
    $result.publicSchemaReachable -and
    $result.officeIntegrationPresent -and
    $result.allNonConsequential
)

if (-not $coreOk -or ($RequireFigma -and -not $figmaConfigured)) {
    exit 1
}

