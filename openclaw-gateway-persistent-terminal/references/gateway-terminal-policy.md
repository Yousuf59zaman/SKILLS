# Gateway terminal policy

Goal: Yousuf wants a visible OpenClaw gateway terminal/window that stays open. If the real gateway is already running, a manual launch must attach to a live status monitor instead of closing after Enter.

Do not change model routing, auth profiles, API keys, tokens, Telegram bot tokens, or OpenCode/OpenAI auth while applying this skill.

Expected files under `%USERPROFILE%\.openclaw`:

- `gateway.cmd`: wrapper that starts `gateway-supervisor.ps1`; manual duplicate launches run `gateway-manual-monitor.ps1` instead of pausing/exiting.
- `gateway-manual.cmd`: visible user-facing launcher. Use this when Yousuf says the terminal must stay open.
- `gateway-service.cmd`: non-interactive launcher for scheduled/watchdog use.
- `gateway-manual-monitor.ps1`: ASCII/Banglish status loop. Enter does not close it; Ctrl+C or window X closes only the monitor.
- `gateway-supervisor.ps1`: owns the actual long-running gateway/restart loop. Duplicate launches should not start a second gateway.
- `gateway-autostart.ps1`: watchdog/startup guard. It should use service mode (`--service`) so hidden duplicate starts do not pause.

Validation checklist:

1. `Get-NetTCPConnection -LocalPort 18789 -State Listen` shows a listener.
2. `openclaw config validate --json` returns valid.
3. `openclaw health --json` returns `ok: true` and plugin `errors: []`.
4. Running `gateway.cmd` while the gateway is already running opens/stays in monitor mode; pressing Enter must not close it.
5. Closing the monitor window must not stop the real supervisor/gateway process.

If scheduled task edits fail with Access Denied, report it and continue; file-level repair is still useful. Do not force elevation.
