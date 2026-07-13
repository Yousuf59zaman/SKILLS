[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Audit', 'Set', 'Cleanup')]
    [string]$Action,

    [string]$RelayRoot = "$env:APPDATA\npm\node_modules\@jacobbd\relay-ai"
)

$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot 'keyring-helper.mjs'

if (-not (Test-Path -LiteralPath $helper)) {
    throw "Keyring helper not found: $helper"
}
if (-not (Test-Path -LiteralPath (Join-Path $RelayRoot 'package.json'))) {
    throw "Relay AI package not found: $RelayRoot"
}

$node = (Get-Command node -ErrorAction Stop).Source

function Invoke-KeyringHelper {
    param(
        [Parameter(Mandatory = $true)][string]$HelperAction,
        [string]$Secret
    )

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $node
    $psi.WorkingDirectory = $RelayRoot
    $psi.Arguments = ('"{0}" {1} "{2}"' -f $helper, $HelperAction.ToLowerInvariant(), $RelayRoot)
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $psi
    [void]$process.Start()
    if ($PSBoundParameters.ContainsKey('Secret')) {
        $process.StandardInput.WriteLine($Secret)
    }
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        throw "Credential operation failed (exit $($process.ExitCode)): $stderr"
    }
    $stdout.Trim()
}

if ($Action -eq 'Set') {
    $secure = Read-Host 'Enter the OpenCode Go API key' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        Invoke-KeyringHelper -HelperAction Set -Secret $plain
    }
    finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
        Remove-Variable plain, secure -ErrorAction SilentlyContinue
    }
    return
}

if ($Action -eq 'Cleanup') {
    $result = Invoke-KeyringHelper -HelperAction Cleanup
    $envNames = @('OPENCODE_API_KEY', 'RELAY_AI_KEY_GO', 'RELAY_AI_KEY_ZEN')
    foreach ($name in $envNames) {
        Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        [Environment]::SetEnvironmentVariable($name, $null, 'User')
        try {
            [Environment]::SetEnvironmentVariable($name, $null, 'Machine')
        }
        catch {
            Write-Warning "Could not clear machine-scoped $name; run as administrator if it exists."
        }
    }
    $environment = foreach ($name in $envNames) {
        foreach ($scope in @('Process', 'User', 'Machine')) {
            $value = [Environment]::GetEnvironmentVariable($name, $scope)
            [pscustomobject]@{ Name = $name; Scope = $scope; Present = -not [string]::IsNullOrWhiteSpace($value) }
        }
    }
    [pscustomobject]@{
        Keyring = ($result | ConvertFrom-Json)
        Environment = @($environment)
    } | ConvertTo-Json -Depth 5
    return
}

Invoke-KeyringHelper -HelperAction Audit

