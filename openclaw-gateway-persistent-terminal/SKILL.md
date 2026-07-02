---
name: openclaw-gateway-persistent-terminal
description: Repair and verify Yousuf's Windows OpenClaw gateway launcher so the visible gateway terminal stays open, real gateway logs are shown in a separate live-log terminal, duplicate manual starts attach to a live monitor instead of closing, and watchdog/service launches stay non-interactive. Use when OpenClaw gateway terminal closes instantly, says another supervisor is already running, exits after pressing Enter, only shows status instead of real logs, needs persistent visible status/live logs, or gateway/supervisor/watchdog launcher files must be hardened without touching auth/model routing.
---

# OpenClaw Gateway Persistent Terminal

## Workflow

1. Read `references/gateway-terminal-policy.md` before editing launcher files.
2. Run the bundled repair script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\User\.codex\skills\openclaw-gateway-persistent-terminal\scripts\repair-openclaw-gateway-terminal.ps1"
```

Use `-OpenVisible` when Yousuf wants a visible terminal opened immediately:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\User\.codex\skills\openclaw-gateway-persistent-terminal\scripts\repair-openclaw-gateway-terminal.ps1" -OpenVisible
```

3. Confirm these visible/manual launcher paths for future use:

```text
C:\Users\User\.openclaw\gateway-manual.cmd
C:\Users\User\.openclaw\gateway-live-log.cmd
```

## Rules

- Do not touch OpenClaw auth files, OAuth state, API keys, Telegram tokens, or model routing.
- Do not treat a duplicate-supervisor message as a crash if port `127.0.0.1:18789` is listening.
- Manual launches must open a real live-log terminal and keep a separate status monitor open.
- Service/watchdog launches must use service mode and exit cleanly.
- If Windows denies scheduled task edits, report that limitation and continue with file-level repair.

## Verify

Run:

```powershell
Get-NetTCPConnection -LocalPort 18789 -State Listen
openclaw config validate --json
openclaw health --json
```

Expected result: gateway is listening, config is valid, health is `ok: true`, and manual duplicate launches do not close on Enter.

Also verify:

```powershell
Test-Path "$env:USERPROFILE\.openclaw\gateway-live-log.cmd"
Test-Path "$env:USERPROFILE\.openclaw\logs\gateway-live.out.log"
```

Expected result: both paths exist, and `gateway-live-log.cmd` can be opened/closed without stopping the gateway.
