---
name: taskbar-zorder
description: Diagnose and control Windows taskbar Z-order with Win32 HWND operations, including a hidden always-running watcher and current-user logon autostart. Use when Yousuf asks to let normal desktop apps cover the taskbar/footer, keep the taskbar behind apps after switching windows, inspect Shell_TrayWnd topmost state, install or repair invisible startup persistence, prevent duplicate watchers, restore taskbar ordering, or explain/fix Explorer taskbar Z-order behavior.
---

# Taskbar Z-Order

Use the bundled scripts for Windows 10/11 taskbar ordering. Do not rewrite the Win32 interop or Scheduled Task setup ad hoc.

```powershell
$skill = "$env:USERPROFILE\.codex\skills\skill-vault\vault\taskbar-zorder"
$zorder = "$skill\scripts\taskbar-zorder.ps1"
$autostart = "$skill\scripts\taskbar-zorder-autostart.ps1"
```

## Safety

- Treat this as an unsupported live Explorer/window-manager tweak, not a registry policy.
- Do not patch Explorer, inject DLLs, modify shell binaries, or create a machine-start task.
- Use a current-user logon trigger because the taskbar HWND exists only in an interactive user session.
- Install autostart only when the user explicitly wants persistent or startup behavior.
- Always report the Scheduled Task name, watcher PID, and rollback commands.
- Verify restoration. On some Windows 11 sessions, `RestoreTaskbar` reports success while `WS_EX_TOPMOST` remains cleared; restarting Explorer is the reliable fallback and can close File Explorer windows.

## Live modes

Run the script directly in the current PowerShell host:

```powershell
& $zorder -Mode Status
& $zorder -Mode DemoteTaskbar
& $zorder -Mode LowerTaskbar
& $zorder -Mode KeepTaskbarLowered -IntervalMs 50
& $zorder -Mode RestoreTaskbar
& $zorder -Mode PinForeground
```

- `Status` reports taskbar HWNDs, process, PID, visibility, `WS_EX_TOPMOST`, extended style, and rectangle.
- `DemoteTaskbar` removes topmost state once.
- `LowerTaskbar` removes topmost state and moves taskbar HWNDs to `HWND_BOTTOM` once.
- `KeepTaskbarLowered` repeats lowering; use 50 ms when Explorer restacks the taskbar after app switching.
- `RestoreTaskbar` requests topmost state.
- `PinForeground` makes the current foreground window topmost; it does not solve Explorer restacking globally.

## Hidden always-on autostart

Prefer the autostart installer over Startup-folder VBS files or a manually detached process:

```powershell
& $autostart -Mode Install -IntervalMs 50
& $autostart -Mode Status
```

`Install` creates or repairs the current-user Scheduled Task `Taskbar Z-Order Watcher`, stops duplicate manual watchers, and starts one hidden instance immediately. The task must use:

- current-user logon trigger;
- hidden, non-interactive PowerShell;
- `KeepTaskbarLowered -IntervalMs 50`;
- unlimited execution time;
- `IgnoreNew` multiple-instance policy;
- battery-safe continuous operation;
- restart on failure every minute.

Do not use an `AtStartup` trigger: it runs outside the interactive desktop and cannot manage the signed-in user's taskbar.

Verify after installation:

```powershell
& $autostart -Mode Status | Format-List *
```

Require all of these before reporting success:

- task state is `Running`;
- trigger is a current-user logon trigger and is enabled;
- exactly one watcher process exists;
- watcher `MainWindowHandle` is `0`;
- taskbar `Topmost` is `False` while the watcher is running;
- stop/start lifecycle produces a new working PID;
- a second start keeps one instance because `IgnoreNew` is active.

## Functional overlap test

1. Run `Status`, then `LowerTaskbar`.
2. Place a normal non-topmost app so its rectangle genuinely intersects the taskbar rectangle.
3. Switch to another app and back.
4. Probe an intersection point or visually verify that the app, not `Shell_TrayWnd`, is on top.
5. If Explorer restacks the taskbar, install/start the 50 ms watcher and repeat the test.

Do not infer overlap from a screenshot alone. Confirm the app rectangle intersects the taskbar rectangle or sample `WindowFromPoint` at an intersection coordinate.

## Stop and rollback

Stop and remove autostart:

```powershell
& $autostart -Mode Uninstall
```

Then request normal restoration and verify it:

```powershell
& $zorder -Mode RestoreTaskbar
& $zorder -Mode Status
```

If `Topmost` remains `False`, explain the limitation and restart Explorer only with the user's authorization:

```powershell
Stop-Process -Name explorer -Force
Start-Process explorer.exe
```

## Internals

The Z-order script uses `EnumWindows`, `GetWindowLongPtr`, `SetWindowPos`, and `GetForegroundWindow` from `user32.dll`. The autostart installer uses the Windows ScheduledTasks module and a stable per-user `pwsh.exe` launcher when available. It does not edit the registry, DWM settings, Explorer binaries, or shell startup files.
