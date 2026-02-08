param(
    [switch]$Once,              # Optional single-run mode (useful for testing)
    [int]$IntervalSeconds = 300 # Continuous run interval when not using -Once (default 5 minutes)
)

$screenshotsPath = "C:\Users\ORANGEBD\Pictures\Screenshots"
$logPath = "$env:USERPROFILE\Scripts\ScreenshotCleaner.log"

# Write a line to the log file with a timestamp.
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logPath -Value "$timestamp - $Message"
}

# Delete screenshots strictly older than 24 hours.
function Clean-OldScreenshots {
    param([string]$FolderPath)

    try {
        $now = Get-Date
        $cutoff = $now.AddHours(-24)

        $allFiles = Get-ChildItem -Path $FolderPath -File -ErrorAction SilentlyContinue
        if (-not $allFiles -or $allFiles.Count -eq 0) {
            Write-Log "No screenshots found. Cutoff: $($cutoff.ToString('yyyy-MM-dd HH:mm:ss'))"
            return
        }

        $deleted = 0
        $kept = 0

        foreach ($file in $allFiles) {
            if ($file.LastWriteTime -lt $cutoff) {
                try {
                    Remove-Item -Path $file.FullName -Force -ErrorAction Stop
                    $deleted++
                } catch {
                    Write-Log "Failed to delete $($file.Name): $_"
                }
            } else {
                $kept++
            }
        }

        Write-Log "Cleanup complete. Kept: $kept, Deleted: $deleted, Cutoff: $($cutoff.ToString('yyyy-MM-dd HH:mm:ss'))"
    } catch {
        Write-Log "Error during cleanup: $_"
    }
}

# Configure folder view (newest first); done once at startup.
function Set-FolderViewNewestFirst {
    param([string]$FolderPath)

    try {
        $iniPath = Join-Path $FolderPath "desktop.ini"
        if (Test-Path $iniPath) {
            Write-Log "Folder view already configured (desktop.ini exists)."
            return
        }

        $desktopIni = @"
[.ShellClassInfo]
IconResource=%SystemRoot%\System32\imageres.dll,164
[ViewState]
Mode=4
Vid=
FolderType=Pictures
"@

        $folderItem = Get-Item $FolderPath -ErrorAction Stop

        # Clear read-only so we can write the ini, then restore it.
        $folderItem.Attributes = 'Directory'
        $desktopIni | Out-File -FilePath $iniPath -Encoding ASCII -Force

        (Get-Item $FolderPath).Attributes = 'Directory, ReadOnly'
        (Get-Item $iniPath).Attributes = 'Hidden, System, Archive'

        Write-Log "Folder view configured (sort by newest first)."
    } catch {
        Write-Log "Folder view configuration skipped/failed: $_"
    }
}

# Ensure working paths exist
if (-not (Test-Path $screenshotsPath)) {
    New-Item -ItemType Directory -Path $screenshotsPath -Force | Out-Null
}

if (-not (Test-Path $logPath)) {
    New-Item -ItemType File -Path $logPath -Force | Out-Null
}

Set-FolderViewNewestFirst -FolderPath $screenshotsPath
Write-Log "Screenshot cleaner started. IntervalSeconds=$IntervalSeconds, Once=$Once"

# Initial cleanup
Clean-OldScreenshots -FolderPath $screenshotsPath

# Continuous monitoring unless -Once is set
if (-not $Once) {
    while ($true) {
        Start-Sleep -Seconds $IntervalSeconds
        Clean-OldScreenshots -FolderPath $screenshotsPath
    }
} else {
    Write-Log "Single-run mode complete."
}
