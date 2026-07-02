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
