---
name: openclaw-codex-auth-refresh-fix
description: Diagnose and repair OpenClaw openai-codex OAuth refresh timeout failures, especially "auth refresh request timed out after 10s", Telegram agents replying "Something went wrong", stale openai-codex/gpt-5.4 fallback drift, stale session auth profile pins, and Codex app-server child/lock buildup after OpenClaw updates. Use when Yousuf asks to fix OpenClaw Codex auth refresh, make Telegram agents work again, repair gpt-5.5 Codex routing, or preserve xhigh/fast-off while resolving OpenClaw Codex runtime auth failures.
---

# OpenClaw Codex Auth Refresh Fix

## Core Workflow

Use this skill for the known OpenClaw 2026.5.26 Codex OAuth bridge failure where the gateway and Telegram are healthy but model runs fail with:

`auth refresh request timed out after 10s`

Primary fix:

- Patch the OpenClaw Codex bridge so `account/chatgptAuthTokens/refresh` reuses a still-valid OAuth access token instead of forcing OAuth refresh on every request.
- Remove stale `openai-codex/gpt-5.4` fallback/cache drift.
- Align the `openai-codex` profile/order state across `clawdbot_agent`, `openclaw_agent`, `moltbot_agent`, and `main-cron`.
- Clear stale live session auth pins and stale app-server metadata.
- Restart gateway and run non-secret smoke tests.

Never print tokens, refresh tokens, access tokens, API keys, raw auth profile JSON, or raw auth state. Summarize only counts, route names, hashes, and pass/fail metadata.

## Fast Repair Script

Run the bundled PowerShell helper from the skill directory:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\User\.codex\skills\openclaw-codex-auth-refresh-fix\scripts\repair-openclaw-codex-auth-refresh.ps1 -RunSmoke
```

Use `-RunSmoke` when the user wants verification. Omit it for config-only repair.

The script is intentionally scoped to:

- `C:\Users\User\.openclaw\openclaw.json`
- `C:\Users\User\.openclaw\agents\{clawdbot_agent,openclaw_agent,moltbot_agent,main-cron}`
- `C:\Users\User\.openclaw\npm\node_modules\@openclaw\codex\dist\shared-client-*.js`
- live `sessions.json` and `*.codex-app-server.json` metadata, not `_archive` trajectories
- OpenClaw-owned Codex app-server child processes only

## Manual Verification

After repair, confirm:

```powershell
openclaw config validate --json
openclaw gateway status --json
openclaw gateway health --json --timeout 60000
```

Expected state:

- gateway version is `2026.5.26` or newer
- `agents.defaults.model.primary` is `openai-codex/gpt-5.5`
- no `openai-codex/gpt-5.4` fallback remains
- `thinkingDefault` is `xhigh`
- fast mode is off
- `heartbeatSeconds` is `0` if heartbeat messages were disabled earlier

## Smoke Tests

Run serialized, non-delivered tests:

```powershell
openclaw agent --agent clawdbot_agent --session-key agent:clawdbot_agent:smoke-codex-auth-repair --message "NON_SECRET_SMOKE_TEST: reply exactly SMOKE_OK and nothing else." --thinking xhigh --json --timeout 300
openclaw agent --agent openclaw_agent --session-key agent:openclaw_agent:smoke-codex-auth-repair --message "NON_SECRET_SMOKE_TEST: reply exactly SMOKE_OK and nothing else." --thinking xhigh --json --timeout 300
openclaw agent --agent moltbot_agent --session-key agent:moltbot_agent:smoke-codex-auth-repair --message "NON_SECRET_SMOKE_TEST: reply exactly SMOKE_OK and nothing else." --thinking xhigh --json --timeout 300
```

Pass criteria:

- output contains `SMOKE_OK`
- metadata shows provider `openai-codex`
- metadata shows model `gpt-5.5`
- no `auth refresh request timed out after 10s`
- no `Missing API key`
- no fallback exhaustion

## If It Recurs After Update

OpenClaw or `@openclaw/codex` updates can overwrite the bridge patch. Re-run the repair script. If the script reports the bridge file is missing, reinstall/sync OpenClaw first with the OpenClaw update gateway sync skill, then rerun this skill.
