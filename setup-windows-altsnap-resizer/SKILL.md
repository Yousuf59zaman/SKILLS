---
name: setup-windows-altsnap-resizer
description: Install, configure, repair, and verify AltSnap on Windows so stubborn Electron and desktop windows can be moved or resized from anywhere. Use when Codex, OpenCode, Claude, ChatGPT, or fixed-size windows resist normal resizing, Alt+mouse controls do not work, or AltSnap must start automatically after Windows login.
---

# Setup Windows AltSnap Resizer

Prefer the existing non-invasive Windows Resizer workflow. Do not patch application packages unless explicitly requested.

## Apply

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\windows-resizer\scripts\setup-windows-resizer.ps1"
```

For visible-window inspection:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\windows-resizer\scripts\setup-windows-resizer.ps1" -InspectProcess Codex,OpenCode
```

Required configuration:

- `ResizeAll=1`
- `IgnoreMinMaxInfo=3`
- Per-user Startup shortcut for AltSnap
- Running AltSnap process

## Verify

```powershell
Get-Process -Name AltSnap -ErrorAction SilentlyContinue
Select-String "$env:LOCALAPPDATA\Programs\AltSnap\AltSnap.ini" -Pattern "^ResizeAll=|^IgnoreMinMaxInfo="
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\AltSnap.lnk"
```

Tell the user:

- `Alt + Right Mouse Drag`: resize from anywhere.
- `Alt + Left Mouse Drag`: move from anywhere.

## Guardrails

- Use the official AltSnap release source.
- Do not modify `app.asar`, WindowsApps packages, signatures, or app minimum-size code during normal setup.
- A non-elevated AltSnap process may not control an elevated app; explain that boundary before suggesting elevated execution.

