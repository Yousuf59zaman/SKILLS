$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$EnvPath = Join-Path $ProjectRoot ".env"
$ExampleEnvPath = Join-Path $ProjectRoot ".env.example"

Set-Location $ProjectRoot

if (-not (Test-Path $VenvPython)) {
    python -m venv (Join-Path $ProjectRoot ".venv")
}

& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $ProjectRoot "requirements.txt")

if (-not (Test-Path $EnvPath)) {
    Copy-Item -LiteralPath $ExampleEnvPath -Destination $EnvPath
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $secret = [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
    $content = Get-Content -LiteralPath $EnvPath -Raw
    $content = $content.Replace("replace-this-with-a-long-random-secret", $secret)
    $content = $content.Replace("C:\Users\User", $env:USERPROFILE)
    Set-Content -LiteralPath $EnvPath -Value $content -Encoding UTF8
    Write-Host "Created .env with a random BRIDGE_SECRET."
}

New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "logs") -Force | Out-Null
Write-Host "Setup complete: $ProjectRoot"
