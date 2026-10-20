# Gateway terminal policy

Goal: Yousuf wants visible OpenClaw gateway terminal windows that stay open. Manual launch should open a real live-log terminal for gateway stdout/stderr plus a separate status monitor. If the real gateway is already running, a manual launch must attach to monitoring instead of closing after Enter.

Do not change model routing, auth profiles, API keys, tokens, Telegram bot tokens, or OpenCode/OpenAI auth while applying this skill.

Expected files under `%USERPROFILE%\.openclaw`:

- `gateway.cmd`: wrapper that starts `gateway-supervisor.ps1`; manual duplicate launches run `gateway-manual-monitor.ps1` instead of pausing/exiting.
- `gateway-manual.cmd`: visible user-facing launcher. It should open `gateway-live-log.cmd` first, then call `gateway.cmd`.
- `gateway-live-log.cmd`: visible real gateway log launcher. Closing it must not stop the gateway.
- `gateway-live-log.ps1`: tails `logs\gateway-supervisor.log`, `logs\gateway-live.out.log`, and `logs\gateway-live.err.log`.
- `gateway-service.cmd`: non-interactive launcher for scheduled/watchdog use.
- `gateway-manual-monitor.ps1`: ASCII/Banglish status loop. Enter does not close it; Ctrl+C or window X closes only the monitor.
- `gateway-supervisor.ps1`: owns the actual long-running gateway/restart loop. Duplicate launches should not start a second gateway. Real gateway process stdout/stderr should be redirected to `logs\gateway-live.out.log` and `logs\gateway-live.err.log`.
- `gateway-autostart.ps1`: watchdog/startup guard. It should use service mode (`--service`) so hidden duplicate starts do not pause.

Validation checklist:

1. `Get-NetTCPConnection -LocalPort 18789 -State Listen` shows a listener.
2. `openclaw config validate --json` returns valid.
3. `openclaw health --json` returns `ok: true` and plugin `errors: []`.
4. Running `gateway-manual.cmd` opens a live-log terminal and a monitor/status terminal.
5. Running `gateway.cmd` while the gateway is already running opens/stays in monitor mode; pressing Enter must not close it.
6. Closing the live-log or monitor window must not stop the real supervisor/gateway process.
7. `logs\gateway-live.out.log` contains actual OpenClaw gateway output, not only periodic status messages.

If scheduled task edits fail with Access Denied, report it and continue; file-level repair is still useful. Do not force elevation.

## Visibility note (2026-10-19): automated children must not open consoles

- The visible consoles are intentional and belong to the user: the manual status
  console plus the separate live-log tail. Automated gateway/prewarm spawns must
  never create or focus an additional console while those are already open.
- Any `Start-Process` that launches an automated child with redirected
  stdout/stderr must carry `-NoNewWindow` so the console-subsystem child keeps
  the current (or no) console instead of requesting its own. Applied to the
  gateway child spawn in `gateway-supervisor-manual-only.ps1` (single flag,
  on-disk fix; takes effect only when the supervisor reloads the file — a
  running supervisor keeps executing its already-loaded source).
- Windows PowerShell 5.1 rejects `-NoNewWindow` combined with `-WindowStyle`;
  use one or the other (redirected console child: `-NoNewWindow`).
- Status 2026-10-19 ~23:39: fix ACTIVE — a fresh supervisor generation loaded the
  patched source (user-approved OpenClaw-only restart; accepted hash verified
  pre-stop and unchanged after, fresh hidden-VBS supervisor birth, new
  after-patch child, state `running`). Launch-count reset merely corroborates
  reinit; it alone does not prove loaded bytes. Activation UI-event coverage is
  UNOBSERVED (restart fell in the 23:24:25-23:38:19 witness gap) — no
  flash-free claim; never restart for an observability test. Flash-free
  recovery awaits the first genuine recovery and was not forced.
- Never relaunch from a visible manual console as an activation path for a
  hidden fix: it risks duplicate/focused windows. Use the existing hidden
  service entrypoint (`wscript.exe //B //Nologo gateway-supervisor-hidden.vbs`,
  same path `gateway.cmd` service mode and the logon scheduled task take).
