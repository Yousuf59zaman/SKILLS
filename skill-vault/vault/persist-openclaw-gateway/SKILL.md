---
name: persist-openclaw-gateway
description: Repair and verify the Windows OpenClaw gateway launcher, visible status terminal, separate live-log terminal, supervisor, scheduled startup, and watchdog. Use when the gateway terminal closes, duplicate starts exit, only status is visible, real logs are missing, the gateway process crashes, or port health is live while Telegram channel workers are stopped.
---

# Persist OpenClaw Gateway

Keep manual terminals visible and service/watchdog launches non-interactive. Do not touch model routing or credentials.

## Canonical Repair

Read the canonical policy before applying:

```text
C:\Users\User\.codex\skills\openclaw-gateway-persistent-terminal\references\gateway-terminal-policy.md
```

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\openclaw-gateway-persistent-terminal\scripts\repair-openclaw-gateway-terminal.ps1"
```

Use `-OpenVisible` only when a visible terminal should open immediately.

Expected manual launchers:

```text
C:\Users\User\.openclaw\gateway-manual.cmd
C:\Users\User\.openclaw\gateway-live-log.cmd
```

## Supervisor and Watchdog Contract

- One supervisor owns one gateway process.
- A duplicate manual start opens or attaches to persistent status/live-log windows; it does not start another gateway or close immediately.
- The live-log window tails real gateway stdout/stderr separately from the status monitor.
- Service/watchdog starts are hidden and non-interactive.
- Treat the gateway as healthy only when TCP `18789`, gateway health, and enabled Telegram account workers are healthy.
- If the port is live but enabled Telegram accounts remain `running:false` or `restartPending:true` across two checks, restart the gateway with bounded backoff.
- Never restart merely because an intentionally disabled channel is stopped.

## Verify

```powershell
Get-NetTCPConnection -LocalPort 18789 -State Listen
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
& "$env:APPDATA\npm\openclaw.cmd" health --json
& "$env:APPDATA\npm\openclaw.cmd" channels status --probe --json
Test-Path "$env:USERPROFILE\.openclaw\gateway-live-log.cmd"
Test-Path "$env:USERPROFILE\.openclaw\logs\gateway-live.out.log"
```

Open and close only the monitor/live-log terminals during UI testing; confirm the gateway process remains alive.

## Guardrails

- Never read or alter Telegram tokens, OpenCode keys, OAuth state, auth profiles, or model routing.
- Do not treat `another supervisor is already running` as a crash when the owned gateway and channels are healthy.
- Back up launcher/supervisor/watchdog files before editing them.
- Bound restart attempts to avoid a crash loop.

