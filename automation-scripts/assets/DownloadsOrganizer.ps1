# Downloads Auto-Organizer Script
# Monitors Downloads folder and organizes files automatically

$downloadsPath = "$env:USERPROFILE\Downloads"

# File categories and their extensions
$categories = @{
    "Documents" = @(".pdf", ".doc", ".docx", ".txt", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".rtf", ".csv")
    "Images" = @(".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp", ".ico", ".tiff", ".psd", ".ai")
    "Videos" = @(".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpg", ".mpeg")
    "Audio" = @(".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus")
    "Archives" = @(".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".iso", ".dmg")
    "Installers" = @(".exe", ".msi", ".dmg", ".pkg", ".deb", ".rpm", ".apk")
    "Code" = @(".js", ".py", ".java", ".cpp", ".c", ".cs", ".php", ".html", ".css", ".json", ".xml", ".sql", ".sh", ".bat", ".ps1")
    "Ebooks" = @(".epub", ".mobi", ".azw", ".azw3")
    "Fonts" = @(".ttf", ".otf", ".woff", ".woff2")
}

# Function to get category for a file
function Get-FileCategory {
    param($extension)
    
    foreach ($category in $categories.Keys) {
        if ($categories[$category] -contains $extension.ToLower()) {
            return $category
        }
    }
    return "Others"
}

# Function to move file safely
function Move-FileSafely {
    param($sourcePath, $destinationFolder)
    
    try {
        # Wait a bit to ensure file is fully downloaded
        Start-Sleep -Milliseconds 500
        
        # Check if file still exists and is not locked
        if (-not (Test-Path $sourcePath)) {
            return
        }
        
        $fileName = Split-Path $sourcePath -Leaf
        $destinationPath = Join-Path $destinationFolder $fileName
        
        # Create destination folder if it doesn't exist
        if (-not (Test-Path $destinationFolder)) {
            New-Item -ItemType Directory -Path $destinationFolder -Force | Out-Null
            Write-Host "Created folder: $destinationFolder" -ForegroundColor Green
        }
        
        # Handle duplicate file names
        $counter = 1
        $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
        $extension = [System.IO.Path]::GetExtension($fileName)
        
        while (Test-Path $destinationPath) {
            $newFileName = "${nameWithoutExt}_($counter)${extension}"
            $destinationPath = Join-Path $destinationFolder $newFileName
            $counter++
        }
        
        # Move the file
        Move-Item -Path $sourcePath -Destination $destinationPath -Force
        Write-Host "Moved: $fileName -> $destinationFolder" -ForegroundColor Cyan
        
    } catch {
        Write-Host "Error moving file: $_" -ForegroundColor Red
    }
}

# Function to organize existing files
function Organize-ExistingFiles {
    Write-Host "`nOrganizing existing files in Downloads..." -ForegroundColor Yellow
    
    $files = Get-ChildItem -Path $downloadsPath -File
    
    foreach ($file in $files) {
        $extension = $file.Extension
        if ([string]::IsNullOrEmpty($extension)) {
            continue
        }
        
        $category = Get-FileCategory -extension $extension
        $categoryFolder = Join-Path $downloadsPath $category
        
        Move-FileSafely -sourcePath $file.FullName -destinationFolder $categoryFolder
    }
    
    Write-Host "Existing files organized!`n" -ForegroundColor Green
}

# Create FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $downloadsPath
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

# Define the action to take when a file is created
$action = {
    $path = $Event.SourceEventArgs.FullPath
    $fileName = $Event.SourceEventArgs.Name
    $changeType = $Event.SourceEventArgs.ChangeType
    
    # Skip if it's a folder or temporary file
    if ((Test-Path $path) -and (Get-Item $path).PSIsContainer) {
        return
    }
    
    # Skip temporary files
    if ($fileName -match '\.tmp$|\.crdownload$|\.part$|\.download$') {
        return
    }
    
    # Wait for file to be completely downloaded
    Start-Sleep -Seconds 2
    
    if (-not (Test-Path $path)) {
        return
    }
    
    $extension = [System.IO.Path]::GetExtension($fileName)
    if ([string]::IsNullOrEmpty($extension)) {
        return
    }
    
    $category = Get-FileCategory -extension $extension
    $categoryFolder = Join-Path $downloadsPath $category
    
    Move-FileSafely -sourcePath $path -destinationFolder $categoryFolder
}

# Register the event
Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action | Out-Null

# Display startup message
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DOWNLOADS AUTO-ORGANIZER RUNNING" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Monitoring: $downloadsPath" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop..." -ForegroundColor Gray
Write-Host ""

# Organize existing files first
Organize-ExistingFiles

# Keep the script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }

} finally {
    # Cleanup on exit
    $watcher.EnableRaisingEvents = $false
    $watcher.Dispose()
    Write-Host "`nOrganizer stopped." -ForegroundColor Red
}
