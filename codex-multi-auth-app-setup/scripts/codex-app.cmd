@echo off
REM codex-app.cmd — restart the NEW ChatGPT desktop app (MSIX OpenAI.Codex / ChatGPT.exe)
REM after a codex-multi-auth switch. Launches by AppUserModelID; `codex app` can't
REM detect the Store install. Usage:  codex-app [account_index] [--no-stop]

if exist "%~dp0codex-app.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0codex-app.ps1" %*
) else (
    echo codex-app.ps1 not found next to %~f0
    exit /b 1
)