@echo off

REM codex-stop-all.cmd - explicit manual STOP of the shared Codex runtime
REM (new ChatGPT desktop app family ONLY + owned shared backend).
REM
REM Same canonical implementation as `codex-app -StopOnly`: stops the
REM installed OpenAI.Codex Desktop family, stops the owned shared
REM supervisor+native, verifies BOTH frozen ports (19457/19458) released,
REM then publishes a boot-scoped manual pause so healers/startup do NOT
REM respawn until the next manual codex-app/-NoStop/switch resumes (or the
REM next Windows boot autostarts). Never switches auth, never boots.
REM
REM Never touches Classic OpenAI.ChatGPT-Desktop or other processes.
REM Any extra argument conflicts and refuses before any mutation.

REM Usage:  codex-stop-all
if exist "%~dp0codex-app.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0codex-app.ps1" -StopOnly %*
) else (
    echo codex-app.ps1 not found next to %~f0
    exit /b 1
)
