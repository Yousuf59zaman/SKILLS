@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Per-user, visible Desktop Commander Remote auto-start setup.
rem This script does not elevate, reboot, or stop an existing remote session.
set "PATH=%APPDATA%\npm;%PATH%"
if /i "%~1"=="--run" goto run_remote

title Desktop Commander Remote - Startup Setup
set "DC_SETUP_SOURCE=%~f0"
echo Configuring Desktop Commander Remote for your Windows sign-in...
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; try { $null=Get-Command npx.cmd -CommandType Application -ErrorAction Stop; $root=Join-Path $env:LOCALAPPDATA 'DesktopCommander-Autostart'; $startup=[Environment]::GetFolderPath('Startup'); if ([string]::IsNullOrWhiteSpace($startup)) { throw 'The current user Startup folder could not be found.' }; $null=New-Item -ItemType Directory -Path $root -Force; $null=New-Item -ItemType Directory -Path $startup -Force; $launcher=Join-Path $root 'Start-Remote.cmd'; $source=[IO.Path]::GetFullPath($env:DC_SETUP_SOURCE); if (-not [string]::Equals($source,[IO.Path]::GetFullPath($launcher),[StringComparison]::OrdinalIgnoreCase)) { Copy-Item -LiteralPath $source -Destination $launcher -Force }; $linkPath=Join-Path $startup 'Desktop Commander Remote.lnk'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($linkPath); $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\cmd.exe'; $dq=[char]34; $shortcut.Arguments='/d /c '+$dq+$dq+$launcher+$dq+' --run'+$dq; $shortcut.WorkingDirectory=$root; $shortcut.WindowStyle=1; $shortcut.Description='Desktop Commander Remote at sign-in; npm installation automatically confirmed.'; $shortcut.Save(); if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'The launcher was not saved.' }; if (-not (Test-Path -LiteralPath $linkPath -PathType Leaf)) { throw 'The Startup shortcut was not saved.' }; $saved=$shell.CreateShortcut($linkPath); if ($saved.Arguments -ne $shortcut.Arguments -or $saved.TargetPath -ne $shortcut.TargetPath) { throw 'Startup shortcut verification failed.' }; Write-Host ('Launcher: '+$launcher); Write-Host ('Startup shortcut: '+$linkPath); exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
if errorlevel 1 goto setup_failed
echo.
echo SUCCESS: Auto-start is configured for this Windows user.
echo On your next sign-in, a visible terminal will launch this command:
echo npx --yes @wonderwhy-er/desktop-commander@latest remote
echo.
echo Your current remote session was not restarted or interrupted.
echo This installer has NOT tested a reboot or a fresh remote connection.
echo To disable auto-start: Win+R, type shell:startup, and remove
echo the shortcut named Desktop Commander Remote.
echo.
echo Press any key to close setup.
pause >nul
exit /b 0

:setup_failed
echo.
echo SETUP DID NOT COMPLETE. Review the error above.
echo Check that Node.js/npm is installed and npx.cmd is available.
echo No reboot or existing-session shutdown was requested.
echo Press any key to close.
pause >nul
exit /b 1

:run_remote
title Desktop Commander Remote
cd /d "%~dp0"
where.exe npx.cmd >nul 2>&1
if errorlevel 1 goto missing_npx
set "ATTEMPT=0"
set "MAX_ATTEMPTS=5"
echo Desktop Commander Remote - automatic startup
echo Keep this terminal open for remote access; you may minimize it.
echo Close the terminal to stop this launcher and its retries.
echo.

:try_start
rem Avoid a second agent when one is already running in this Windows session.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -Command "try { $sid=(Get-Process -Id $PID).SessionId; $agent=Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -eq 'node.exe' -and $_.SessionId -eq $sid -and $_.CommandLine -match 'desktop-commander' -and $_.CommandLine -match '\sremote(?:\s|$)' }; if ($agent) { exit 42 }; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
set "CHECK_RESULT=%ERRORLEVEL%"
if "%CHECK_RESULT%"=="42" goto already_running
if not "%CHECK_RESULT%"=="0" goto check_failed
set /a ATTEMPT+=1 >nul
echo [%date% %time%] Starting remote agent - attempt %ATTEMPT% of %MAX_ATTEMPTS%.
rem --yes accepts the npm package installation prompt only.
rem Authentication or other security prompts are not bypassed.
call npx.cmd --yes @wonderwhy-er/desktop-commander@latest remote
set "LAST_EXIT=%ERRORLEVEL%"
if "%LAST_EXIT%"=="0" goto stopped
if %ATTEMPT% GEQ %MAX_ATTEMPTS% goto retries_exhausted
echo.
echo Command exited with code %LAST_EXIT%. Retrying in 30 seconds.
"%SystemRoot%\System32\timeout.exe" /t 30 /nobreak >nul
goto try_start

:already_running
echo Desktop Commander Remote is already running. No duplicate was started.
exit /b 0

:missing_npx
echo ERROR: npx.cmd was not found. Repair Node.js/npm or your PATH.
goto runtime_failed

:check_failed
echo ERROR: Could not check for an existing remote agent.
echo No additional agent was started. Review the error above.
goto runtime_failed

:retries_exhausted
echo.
echo ERROR: The command failed after %MAX_ATTEMPTS% attempts.
echo Last exit code: %LAST_EXIT%.
echo Check your connection and the error messages above.
echo After fixing the issue, run the Desktop Commander Remote Startup shortcut.
goto runtime_failed

:stopped
echo.
echo Desktop Commander Remote stopped normally.
echo Press any key to close this terminal.
pause >nul
exit /b 0

:runtime_failed
echo Press any key to close this terminal.
pause >nul
exit /b 1
