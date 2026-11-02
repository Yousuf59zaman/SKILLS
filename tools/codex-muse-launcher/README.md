# Codex Muse launcher

These Windows PowerShell 7 scripts run an authorized task with the native OpenCode CLI using the pinned `opencode-go/muse-spark-1.3-contributor` model and attest the current-run model from a sanitized session export.

## Requirements

- Windows, PowerShell 7 or later (`pwsh`), and a native `opencode.exe` installed under `%APPDATA%\npm\node_modules\opencode-ai\bin` or available on `PATH`.
- An existing, working OpenCode configuration with access to the pinned model and the tools needed for the task. The launcher does not install OpenCode, configure providers, or set up authentication.
- Both PowerShell files must be in the same directory. The launcher files do not contain credentials or session data.

## Install

From the repository root in PowerShell 7:

```powershell
$museLauncherDir = Join-Path $env:USERPROFILE '.codex\scripts'
New-Item -ItemType Directory -Path $museLauncherDir -Force | Out-Null
Copy-Item -LiteralPath '.\tools\codex-muse-launcher\Invoke-MuseTask.ps1', '.\tools\codex-muse-launcher\MuseTaskCore.ps1' -Destination $museLauncherDir
```

Review any existing files at the destination before copying; the command replaces files with the same names. This installs the launcher only, not any agent skill or global policy.

## Run

```powershell
pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\scripts\Invoke-MuseTask.ps1') -Prompt 'Describe the task' -WorkingDirectory (Get-Location).Path
```

Use `-PromptFile` instead of `-Prompt` for a UTF-8 prompt file. Use `-SessionId` only to continue that task's OpenCode session; use `-AutoApprove` only for authorized actions. The launcher reports model/session metadata after attestation and fails if required model metadata cannot be verified.
