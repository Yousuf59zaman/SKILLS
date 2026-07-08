---
name: taskbar-zorder
description: Diagnose and control Windows taskbar Z-order using Win32 HWND operations. Use when Yousuf asks to make normal desktop app windows appear above or overlap the Windows taskbar/footer, keep the taskbar behind apps after switching windows, inspect Shell_TrayWnd topmost state, restore taskbar ordering, or explain/fix Windows Explorer taskbar Z-order behavior.
---

# Taskbar Z-Order

Use this skill for Windows 10/11 taskbar ordering problems where normal desktop apps should visually cover the taskbar/footer. Prefer the bundled PowerShell script instead of rewriting Win32 interop.

Bundled script:

```powershell
$skill = "$env:USERPROFILE\.codex\skills\taskbar-zorder"
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\taskbar-zorder.ps1" -Mode Status
```

## Safety

- Treat this as an unsupported Explorer/window-manager tweak, not a registry policy.
- Do not patch Explorer, inject DLLs, or modify shell binaries unless explicitly asked.
- Always provide a restore command after starting a persistent watcher.
- If a watcher is started in the background, report its PID.
- Restarts of `explorer.exe`, sign-out, or reboot can reset the taskbar state.

## Modes

`Status` reports `Shell_TrayWnd` and `Shell_SecondaryTrayWnd` HWNDs, process, PID, `WS_EX_TOPMOST`, extended style, and rectangle.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1" -Mode Status
```

`DemoteTaskbar` removes taskbar topmost state once with `HWND_NOTOPMOST`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1" -Mode DemoteTaskbar
```

`LowerTaskbar` removes topmost state and moves the taskbar to `HWND_BOTTOM` once. Use this before persistent mode to verify the current session can be changed.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1" -Mode LowerTaskbar
```

`KeepTaskbarLowered` repeatedly keeps the taskbar non-topmost and at the bottom of the Z-order. Use this for the common issue where apps can initially cover the taskbar, but switching/opening another app causes the taskbar to cover the overlapped area again.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1" -Mode KeepTaskbarLowered -IntervalMs 50
```

Start it hidden in the background when the user wants the behavior to stay active:

```powershell
$script = "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1"
$p = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  $script,
  '-Mode',
  'KeepTaskbarLowered',
  '-IntervalMs',
  '50'
)
"Started KeepTaskbarLowered watcher. PID=$($p.Id)"
```

`RestoreTaskbar` restores the taskbar to topmost.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1" -Mode RestoreTaskbar
```

`PinForeground` sets the current foreground window topmost. This can help for one target app, but it does not solve Explorer restacking by itself.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1" -Mode PinForeground
```

## Workflow

1. Run `Status` and confirm `Shell_TrayWnd` is visible and usually `Topmost: True`.
2. Run `LowerTaskbar`.
3. Ask the user to drag an app over the taskbar and switch/open another app.
4. If the taskbar returns above the overlapped app, start `KeepTaskbarLowered -IntervalMs 50` in a hidden background PowerShell process.
5. Report the watcher PID and the exact stop/restore command:

```powershell
Stop-Process -Id <PID>
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\taskbar-zorder\scripts\taskbar-zorder.ps1" -Mode RestoreTaskbar
```

## Internals

The script uses `user32.dll` APIs:

- `EnumWindows` to find `Shell_TrayWnd` and `Shell_SecondaryTrayWnd`.
- `GetWindowLongPtr(GWL_EXSTYLE)` to test `WS_EX_TOPMOST`.
- `SetWindowPos(HWND_NOTOPMOST)` to remove topmost state.
- `SetWindowPos(HWND_BOTTOM)` to place the taskbar below normal windows.
- `GetForegroundWindow` plus `SetWindowPos(HWND_TOPMOST)` for foreground-window pinning.

This changes live HWND ordering only. It does not edit the registry, DWM settings, Explorer binaries, or shell startup configuration.
