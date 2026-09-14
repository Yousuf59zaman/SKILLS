@echo off
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0browser-shared-chrome.ps1"
exit /b %ERRORLEVEL%
