param(
    [Parameter(Mandatory = $true)]
    [string] $Query,

    [int] $Top = 8
)

$ErrorActionPreference = 'Stop'

$vaultRoot = Join-Path (Split-Path -Parent (Split-Path -Parent $PSCommandPath)) 'vault'
if (-not (Test-Path -LiteralPath $vaultRoot)) {
    throw "Vault folder not found: $vaultRoot"
}

function Get-SkillFrontmatter {
    param([string] $SkillFile)

    $text = Get-Content -LiteralPath $SkillFile -Raw
    $name = ''
    $description = ''

    if ($text -match '(?s)^---\s*(.*?)\s*---') {
        $frontmatter = $Matches[1]
        foreach ($line in ($frontmatter -split "`r?`n")) {
            if ($line -match '^\s*name:\s*(.+?)\s*$') {
                $name = $Matches[1].Trim().Trim('"').Trim("'")
            } elseif ($line -match '^\s*description:\s*(.+?)\s*$') {
                $description = $Matches[1].Trim().Trim('"').Trim("'")
            }
        }
    }

    [pscustomobject] @{
        Name = $name
        Description = $description
        Path = Split-Path -Parent $SkillFile
        SkillFile = $SkillFile
    }
}

$terms = $Query.ToLowerInvariant() -split '[^a-z0-9_+\-.]+' |
    Where-Object { $_ -and $_.Length -gt 1 } |
    Select-Object -Unique

$skills = Get-ChildItem -LiteralPath $vaultRoot -Directory |
    ForEach-Object {
        $skillFile = Join-Path $_.FullName 'SKILL.md'
        if (Test-Path -LiteralPath $skillFile) {
            Get-SkillFrontmatter -SkillFile $skillFile
        }
    }

$skills |
    ForEach-Object {
        $haystack = (($_.Name + ' ' + $_.Description + ' ' + (Split-Path -Leaf $_.Path)).ToLowerInvariant())
        $score = 0
        foreach ($term in $terms) {
            if ($haystack.Contains($term)) {
                $score += 1
            }
        }

        [pscustomobject] @{
            Score = $score
            Name = $_.Name
            Folder = Split-Path -Leaf $_.Path
            Description = $_.Description
            Path = $_.Path
            SkillFile = $_.SkillFile
        }
    } |
    Sort-Object Score, Name -Descending |
    Select-Object -First $Top
