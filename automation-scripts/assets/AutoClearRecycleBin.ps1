# Auto Recycle Bin Cleaner
# Runs at startup and stays resident to delete items older than 24h only.

$ErrorActionPreference = 'Stop'

$logPath = "$env:USERPROFILE\Scripts\RecycleBinCleaner.log"
$logDir  = Split-Path -Parent $logPath
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $logPath -Value "$timestamp - $Message"
}

function Remove-OldRecycleItems {
    $threshold = (Get-Date).AddHours(-24)
    $shell = New-Object -ComObject Shell.Application
    $bin   = $shell.NameSpace(0xA)
    $items = $bin.Items()
    $removed = 0

    foreach ($item in $items) {
        $dateString = $bin.GetDetailsOf($item, 2) # "Date deleted" column
        if ([string]::IsNullOrWhiteSpace($dateString)) { continue }

        # Strip hidden formatting chars (e.g., U+200E) that break parsing on some locales
        $cleanDate = ($dateString -replace '\p{Cf}', '').Trim()
        if ([string]::IsNullOrWhiteSpace($cleanDate)) { continue }

        try {
            $deletedAt = [datetime]::Parse($cleanDate)
        } catch {
            continue
        }
        if ($deletedAt -ne $null -and $deletedAt -lt $threshold) {
            try {
                Remove-Item -LiteralPath $item.Path -Recurse -Force -ErrorAction Stop
                $removed++
            } catch {
                Write-Log "Error removing '$($item.Name)': $($_.Exception.Message)"
            }
        }
    }

    Write-Log "Sweep complete. Removed $removed item(s) older than 24h."
}

# Wait a bit after startup to let system settle
Start-Sleep -Seconds 5

Write-Log "Service started. Monitoring Recycle Bin for items older than 24h."

while ($true) {
    try {
        Remove-OldRecycleItems
    } catch {
        Write-Log "Unexpected error: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 300 # check every 5 minutes
}
