---
name: windows-resizer
description: Set up and troubleshoot Windows utilities for force-moving and force-resizing stubborn desktop app windows, especially Electron/Chromium apps such as Codex Desktop, OpenCode, Claude, ChatGPT, and fixed-minimum-size utility windows. Use when the user wants any app window to become easier to resize, wants AltSnap/ResizeEnable/Sizer installed or configured, wants Codex Desktop minimum window size diagnosed, or wants Electron/Tauri app.asar/minWidth/minHeight/resizable settings inspected before any patching.
---

# Windows Resizer

## Default Workflow

Prefer a non-invasive setup first:

1. Confirm the task is on Windows.
2. Install or refresh AltSnap from the official GitHub release unless the user asked for another utility.
3. Configure AltSnap for stubborn windows:
   - `ResizeAll=1`
   - `IgnoreMinMaxInfo=3`
4. Add a per-user Startup shortcut so AltSnap starts after login.
5. Start AltSnap and verify the process, install path, startup shortcut, and config values.
6. Tell the user the controls:
   - `Alt + Right Mouse Drag` resizes a window from anywhere.
   - `Alt + Left Mouse Drag` moves a window from anywhere.

Use the bundled helper for the default setup:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\windows-resizer\scripts\setup-windows-resizer.ps1"
```

To inspect specific visible app windows after setup:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\windows-resizer\scripts\setup-windows-resizer.ps1" -InspectProcess Codex,OpenCode
```

## Tool Choice

Use this order unless the user specifies otherwise:

1. **AltSnap**: best daily-driver choice for moving/resizing any window with mouse modifiers.
2. **ResizeEnable**: fallback for older fixed dialogs and apps that expose disabled sizing borders.
3. **Sizer**: fallback when the user needs exact preset sizes such as `800x600` or `1200x900`.
4. **App package patching**: last resort only after explicit user approval.

Use official sources. For AltSnap, prefer `RamonUnch/AltSnap` GitHub releases and the portable `bin_x64.zip` asset on x64 Windows.

## Codex Desktop Notes

Codex Desktop is Electron/Chromium-family software. Its installed package can contain `resources\app.asar`, and the main bundle may set minimum sizes with Electron APIs such as `minWidth`, `minHeight`, `setMinimumSize`, and `setResizable`.

For diagnosis, inspect only:

```powershell
npx --yes @electron/asar list "<app>\resources\app.asar"
npx --yes @electron/asar extract-file "<app>\resources\app.asar" "<main-bundle>"
rg -n "minWidth|minHeight|setMinimumSize|resizable" "<extracted-main-bundle>"
```

Do not patch Codex or WindowsApps package files unless the user explicitly asks for permanent app patching. Prefer AltSnap first because package edits are fragile, can be reverted by app updates, and may break signing or app-store-managed installs.

## Safety

- Do not use Computer Use to automate the Codex Desktop UI; use shell/Win32 inspection or user-guided manual testing.
- Do not force-push, patch, or overwrite app packages during normal setup.
- Do not run random resize utilities from download mirrors. Prefer official GitHub or vendor pages.
- If an elevated/admin app cannot be resized, explain that non-elevated AltSnap may not control elevated windows. Only suggest elevated AltSnap or uiAccess signing when the user explicitly accepts that tradeoff.

## Verification

After setup, verify:

```powershell
Get-Process -Name AltSnap -ErrorAction SilentlyContinue
Select-String "$env:LOCALAPPDATA\Programs\AltSnap\AltSnap.ini" -Pattern "^ResizeAll=|^IgnoreMinMaxInfo="
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\AltSnap.lnk"
```

For app window evidence, inspect visible windows and style flags. A window may still have a sizing border while enforcing a minimum size internally; in that case AltSnap with `IgnoreMinMaxInfo=3` is the strongest non-patching option.
