@echo off
setlocal

set "PS1=%~dp0sync-skills.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
if errorlevel 1 (
  echo Sync failed.
  echo Log: "%USERPROFILE%\.codex\log\skills-sync.log"
  pause
  exit /b 1
)

exit /b 0

