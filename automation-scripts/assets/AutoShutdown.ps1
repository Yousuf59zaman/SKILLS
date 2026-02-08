<# Auto-Shutdown Script
   Closes common apps, waits briefly for them to exit, then shuts down the PC.
   Requirement: after closing apps, shutdown happens within ~3 seconds. #>

function Close-ApplicationGracefully {
    param(
        [string]$processName,
        [string]$displayName
    )

    try {
        $processes = Get-Process -Name $processName -ErrorAction SilentlyContinue
        if (-not $processes) { return $false }

        Write-Host "Closing $displayName..." -ForegroundColor Yellow

        foreach ($process in $processes) {
            $process.CloseMainWindow() | Out-Null
        }

        # Give apps a moment to exit gracefully
        Start-Sleep -Seconds 2

        $stillRunning = Get-Process -Name $processName -ErrorAction SilentlyContinue
        if ($stillRunning) {
            Write-Host "  Force closing $displayName..." -ForegroundColor Red
            Stop-Process -Name $processName -Force -ErrorAction SilentlyContinue
        } else {
            Write-Host "  OK: $displayName closed" -ForegroundColor Green
        }

        return $true
    } catch {
        Write-Host "  Note: $displayName may have already closed" -ForegroundColor Gray
        return $false
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  AUTO-SHUTDOWN SEQUENCE" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$appsToClose = @(
    @{Process = "chrome";      Name = "Google Chrome"},
    @{Process = "msedge";      Name = "Microsoft Edge"},
    @{Process = "firefox";     Name = "Firefox"},
    @{Process = "brave";       Name = "Brave Browser"},
    @{Process = "Code";        Name = "Visual Studio Code"},
    @{Process = "claude";      Name = "Claude Desktop"},
    @{Process = "Figma";       Name = "Figma"},
    @{Process = "figma_agent"; Name = "Figma Agent"},
    @{Process = "Discord";     Name = "Discord"},
    @{Process = "Slack";       Name = "Slack"},
    @{Process = "Teams";       Name = "Microsoft Teams"},
    @{Process = "Spotify";     Name = "Spotify"},
    @{Process = "notepad";     Name = "Notepad"},
    @{Process = "notepad++";   Name = "Notepad++"},
    @{Process = "WINWORD";     Name = "Microsoft Word"},
    @{Process = "EXCEL";       Name = "Microsoft Excel"},
    @{Process = "POWERPNT";    Name = "Microsoft PowerPoint"},
    @{Process = "AcroRd32";    Name = "Adobe Acrobat Reader"},
    @{Process = "explorer";    Name = "File Explorer"}
)

Write-Host "Closing applications..." -ForegroundColor Yellow
Write-Host ""

$closedCount = 0
foreach ($app in $appsToClose) {
    if (Close-ApplicationGracefully -processName $app.Process -displayName $app.Name) {
        $closedCount++
    }
    Start-Sleep -Milliseconds 250
}

Write-Host ""
Write-Host "Closed $closedCount application group(s)." -ForegroundColor Green
Write-Host ""

# Short countdown: 3 seconds to comply with requirement
Write-Host "Shutting down in 3 seconds..." -ForegroundColor Red
Start-Sleep -Seconds 3

try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logPath = "$env:USERPROFILE\Scripts\AutoShutdown.log"
    $logEntry = "$timestamp - Auto-shutdown executed. Closed $closedCount application groups."
    Add-Content -Path $logPath -Value $logEntry
} catch { }

Stop-Computer -Force
