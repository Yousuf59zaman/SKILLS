param([switch]$Check, [string]$ConfigDirectory, [string]$StartupDirectory)
$ErrorActionPreference = 'Stop'
if (-not $ConfigDirectory) { $ConfigDirectory = Join-Path $env:USERPROFILE '.config\opencode' }
if (-not $StartupDirectory) { $StartupDirectory = [Environment]::GetFolderPath('Startup') }
$ConfigDirectory = [IO.Path]::GetFullPath($ConfigDirectory)
$shortcutPath = Join-Path $StartupDirectory 'OpenCode-Shared-Chrome.lnk'
if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'No existing shared Chrome startup shortcut was found; inspect startup requirements before creating one.' }
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$launcherPath = Join-Path $ConfigDirectory 'browser-shared-chrome.vbs'
$batchPath = Join-Path $ConfigDirectory 'browser-shared-chrome.bat'
$alreadyHidden = $shortcut.TargetPath -ieq (Join-Path $env:WINDIR 'System32\wscript.exe') -and $shortcut.Arguments.Contains($launcherPath)
if (-not $alreadyHidden -and $shortcut.TargetPath -ine $batchPath) { throw 'Existing startup shortcut targets a different launcher. It was not changed.' }
if ($Check) { Write-Output 'PASS: existing shared Chrome startup shortcut recognized. No changes made.'; exit 0 }
if (-not (Test-Path -LiteralPath $launcherPath)) { throw 'Install the shared Chrome runtime before configuring startup.' }
if ($alreadyHidden) { Write-Output 'Hidden shared Chrome startup is already configured.'; exit 0 }
$installation = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'artifacts\installation.json') -Raw | ConvertFrom-Json
$backupRoot = [IO.Path]::GetFullPath((Join-Path $ConfigDirectory 'backups')).TrimEnd('\') + '\'
$backupDirectory = [IO.Path]::GetFullPath($installation.backup)
if (-not $backupDirectory.StartsWith($backupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installation backup must stay inside the selected OpenCode config backups directory.' }
$backupShortcut = Join-Path $backupDirectory 'OpenCode-Shared-Chrome.lnk'
if (-not (Test-Path -LiteralPath $backupShortcut)) { Copy-Item -LiteralPath $shortcutPath -Destination $backupShortcut }
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '//B //Nologo "' + $launcherPath + '"'
$shortcut.WorkingDirectory = $ConfigDirectory
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output 'Existing startup shortcut now uses the hidden shared Chrome launcher. Original shortcut backed up.'
