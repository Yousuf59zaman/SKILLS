param(
    [switch]$RunOnce
)

$hoursToKeep = 24
$checkIntervalMinutes = 10
$logPath = "$env:USERPROFILE\Scripts\TempCleaner.log"

function Clean-TempFolder {
    param(
        [string]$folderPath,
        [string]$folderName,
        [datetime]$cutoff
    )

    if (-not (Test-Path $folderPath)) {
        Write-Host "Folder not found: $folderPath" -ForegroundColor Yellow
        return @{Deleted = 0; Failed = 0; FreedMB = 0; SkippedAccess = $false}
    }

    try {
        Get-ChildItem -LiteralPath $folderPath -Force -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "  Access denied; skipping $folderName this cycle." -ForegroundColor Yellow
        return @{Deleted = 0; Failed = 0; FreedMB = 0; SkippedAccess = $true}
    }

    Write-Host "`nCleaning: $folderName (older than $hoursToKeep hours only)" -ForegroundColor Cyan
    Write-Host "Path: $folderPath" -ForegroundColor Gray

    $deletedCount = 0
    $failedCount = 0
    $freedBytes = 0
    $skippedAccess = $false

    $oldFiles = Get-ChildItem -LiteralPath $folderPath -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff }

    foreach ($file in $oldFiles) {
        try {
            $size = $file.Length
            Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
            $deletedCount++
            $freedBytes += $size
        } catch {
            $failedCount++
        }
    }

    $oldDirs = Get-ChildItem -LiteralPath $folderPath -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Sort-Object FullName -Descending

    foreach ($dir in $oldDirs) {
        $contents = Get-ChildItem -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue
        if (-not $contents) {
            try {
                Remove-Item -LiteralPath $dir.FullName -Force -Recurse -ErrorAction Stop
                $deletedCount++
            } catch {
                $failedCount++
            }
        }
    }

    $freedSpace = [math]::Round($freedBytes / 1MB, 2)

    Write-Host "  Deleted: $deletedCount items" -ForegroundColor Green
    Write-Host "  Skipped (too new/locked): $failedCount items" -ForegroundColor Yellow
    Write-Host "  Freed Space: $freedSpace MB" -ForegroundColor Cyan

    return @{
        Deleted = $deletedCount
        Failed = $failedCount
        FreedMB = $freedSpace
        SkippedAccess = $skippedAccess
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  TEMP FOLDERS AUTO-CLEANER (24h SAFE)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting cleanup service...`n" -ForegroundColor Yellow

Start-Sleep -Seconds 5

$userTemp = $env:TEMP
$windowsTemp = "C:\Windows\Temp"
$intervalSeconds = $checkIntervalMinutes * 60

do {
    $cutoffTime = (Get-Date).AddHours(-$hoursToKeep)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $userResult = Clean-TempFolder -folderPath $userTemp -folderName "User Temp Folder" -cutoff $cutoffTime
    $windowsResult = Clean-TempFolder -folderPath $windowsTemp -folderName "Windows Temp Folder" -cutoff $cutoffTime

    $totalDeleted = $userResult.Deleted + $windowsResult.Deleted
    $totalFailed = $userResult.Failed + $windowsResult.Failed
    $totalFreed = [math]::Round(($userResult.FreedMB + $windowsResult.FreedMB), 2)
    $accessSkip = $windowsResult.SkippedAccess

    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  CLEANUP SUMMARY @ $timestamp" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Total Items Deleted: $totalDeleted" -ForegroundColor Green
    Write-Host "Total Items Skipped: $totalFailed" -ForegroundColor Yellow
    if ($accessSkip) {
        Write-Host "Windows Temp: skipped (access denied without admin)" -ForegroundColor Yellow
    }
    Write-Host "Total Space Freed: $totalFreed MB" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan

    try {
        $logEntry = "$timestamp - Cutoff: $($cutoffTime.ToString('yyyy-MM-dd HH:mm:ss')) - Deleted: $totalDeleted, Skipped: $totalFailed, Freed: $totalFreed MB"
        if ($accessSkip) {
            $logEntry += " - Windows Temp skipped (access denied)"
        }
        Add-Content -Path $logPath -Value $logEntry
    } catch {
        Write-Host "Note: Cleanup completed (logging skipped)" -ForegroundColor Gray
    }

    if ($RunOnce) { break }
    Start-Sleep -Seconds $intervalSeconds
} while ($true)

Exit
