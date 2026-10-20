param(
    [Parameter(Mandatory = $true)][string] $Query,
    [ValidateRange(1, 50)][int] $Top = 8
)
$ErrorActionPreference = 'Stop'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required for this read-only router. No software was installed.' }
$script = Join-Path $PSScriptRoot 'find-vault-skill.mjs'
$raw = & $node.Source $script --query $Query --top $Top --json
if ($LASTEXITCODE -ne 0) { throw 'Skill discovery failed. Verify the current skill root and query.' }
$items = ($raw -join [Environment]::NewLine) | ConvertFrom-Json
$items | ForEach-Object { $_ }
