---
name: automation-scripts
description: "Clone the ORANGEBD Windows automation toolkit onto other PCs: LaunchAll.bat, AutoShutdown.bat/ps1, Recycle Bin/Screenshot/Temp cleaners, Downloads/Desktop organizers, plus hidden-startup VBS launchers. Use when asked to recreate these scripts, adapt them to a new user profile/app paths, or re-establish their startup behavior on Windows."
---

# Automation Scripts

## Overview

Clone the exact automation scripts by copying the canonical files from `assets/`, then perform a portability pass so the scripts work on the new PC (user profile path and app install paths). Do not retype the scripts; copy and only adjust required paths.

## Workflow (do in order)

1. Collect target paths:
   - `USERPROFILE` (e.g., `C:\Users\Alice`)
   - Scripts folder: `<UserProfile>\Scripts`
   - Desktop-Code folder: `<UserProfile>\Desktop\Desktop-Code`
   - Startup folder: `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup`
   - App install paths for: VS Code, Chrome, Figma, Claude, Windows Terminal

2. Ensure target directories exist:
   - `<UserProfile>\Scripts`
   - `<UserProfile>\Desktop\Desktop-Code`
   - Startup folder

3. Deploy files from `assets/` using the exact filenames (no renames). Copy each file to the target path listed in **File Map**.

4. Portability pass (required on other PCs):
   - Update user-profile paths in `LaunchAll.bat`, `AutoShutdown.bat`, and `AutoSortScreenshots.ps1` to match the target machine.
   - Update `LaunchAll.bat` `Start-Process` paths to the actual app locations (see **App Path Notes**).

5. Add startup launchers:
   - Copy all `Start*.vbs` files to the Startup folder so cleaners/organizers run hidden at login.
   - Keep identical `Start*.vbs` copies in `<UserProfile>\Scripts`.

6. Verify (safe checks only):
   - Do not run `AutoShutdown.bat` unless explicitly requested.
   - For continuous scripts, run once in a terminal, confirm the log entry is written, then stop the process.

## File Map (assets -> target)

Use `<UserProfile>` as the resolved `USERPROFILE` path on the target PC.

- `assets\LaunchAll.bat` -> `<UserProfile>\Desktop\Desktop-Code\LaunchAll.bat`
- `assets\AutoShutdown.bat` -> `<UserProfile>\Scripts\AutoShutdown.bat`
- `assets\AutoShutdown.ps1` -> `<UserProfile>\Scripts\AutoShutdown.ps1`
- `assets\AutoClearRecycleBin.ps1` -> `<UserProfile>\Scripts\AutoClearRecycleBin.ps1`
- `assets\AutoSortScreenshots.ps1` -> `<UserProfile>\Scripts\AutoSortScreenshots.ps1`
- `assets\AutoCleanTemp.ps1` -> `<UserProfile>\Scripts\AutoCleanTemp.ps1`
- `assets\DownloadsOrganizer.ps1` -> `<UserProfile>\Scripts\DownloadsOrganizer.ps1`
- `assets\DesktopOrganizer.ps1` -> `<UserProfile>\Scripts\DesktopOrganizer.ps1`
- `assets\StartRecycleBinCleaner.vbs` -> `<UserProfile>\Scripts\StartRecycleBinCleaner.vbs`
- `assets\StartScreenshotCleaner.vbs` -> `<UserProfile>\Scripts\StartScreenshotCleaner.vbs`
- `assets\StartTempCleaner.vbs` -> `<UserProfile>\Scripts\StartTempCleaner.vbs`
- `assets\StartDownloadsOrganizer.vbs` -> `<UserProfile>\Scripts\StartDownloadsOrganizer.vbs`
- `assets\StartDesktopOrganizer.vbs` -> `<UserProfile>\Scripts\StartDesktopOrganizer.vbs`

Startup copies (same filenames):
- `assets\StartRecycleBinCleaner.vbs` -> `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\StartRecycleBinCleaner.vbs`
- `assets\StartScreenshotCleaner.vbs` -> `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\StartScreenshotCleaner.vbs`
- `assets\StartTempCleaner.vbs` -> `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\StartTempCleaner.vbs`
- `assets\StartDownloadsOrganizer.vbs` -> `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\StartDownloadsOrganizer.vbs`
- `assets\StartDesktopOrganizer.vbs` -> `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\StartDesktopOrganizer.vbs`

## Portability Pass (required edits)

Update these files after copying:

- `LaunchAll.bat`
  - Replace `C:\Users\ORANGEBD\` with `<UserProfile>\` for any user-specific paths.
  - Update each `Start-Process` path to the actual installed app locations.
  - If an app is not installed, comment out its `Start-Process` line.
- `AutoShutdown.bat`
  - Replace `C:\Users\ORANGEBD\Scripts\AutoShutdown.ps1` with `<UserProfile>\Scripts\AutoShutdown.ps1`.
- `AutoSortScreenshots.ps1`
  - Replace the hardcoded screenshots path with `<UserProfile>\Pictures\Screenshots` (or use `$env:USERPROFILE\Pictures\Screenshots`).

## App Path Notes (LaunchAll.bat)

Check these common locations on the target PC and use the exact resolved paths:

- VS Code: `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`
- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe` or `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
- Figma: `%LOCALAPPDATA%\Figma\Figma.exe`
- Claude: `%LOCALAPPDATA%\AnthropicClaude\claude.exe`
- Windows Terminal: `wt.exe` (usually in PATH)

## Behavior Summary (for verification only)

- `LaunchAll.bat`: opens VS Code, Chrome, Figma, Claude, and Windows Terminal via hidden PowerShell.
- `AutoShutdown.bat` + `AutoShutdown.ps1`: prompts, closes common apps, waits 3 seconds, then forces shutdown; logs to `<UserProfile>\Scripts\AutoShutdown.log`.
- `AutoClearRecycleBin.ps1`: every 5 minutes, deletes Recycle Bin items older than 24 hours; logs to `RecycleBinCleaner.log`.
- `AutoSortScreenshots.ps1`: cleans `<UserProfile>\Pictures\Screenshots` by deleting items older than 24 hours; sets folder view to newest-first; logs to `ScreenshotCleaner.log`. Supports `-Once`.
- `AutoCleanTemp.ps1`: cleans user temp and `C:\Windows\Temp` for items older than 24 hours every 10 minutes; logs to `TempCleaner.log`. Supports `-RunOnce`.
- `DownloadsOrganizer.ps1`: monitors Downloads and moves files into category folders.
- `DesktopOrganizer.ps1`: monitors Desktop and moves files into category folders; skips `.lnk`.

## Adjustments (only if paths differ)

- If the target PC stores Downloads/Desktop/Screenshots in a non-default location, update the relevant path variables in the scripts.
- Keep the 24-hour retention behavior unchanged unless the user explicitly requests a different retention window.
