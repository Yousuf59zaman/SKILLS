---
name: openclaw-auth-profile
description: Update each configured OpenClaw agent's existing OpenAI Codex auth-state without changing separate per-agent auth profiles, then run one non-secret smoke prompt per agent. Use when Yousuf asks to run the OpenClaw auth profile skill, update agent auth state, preserve separate auth accounts/profiles, test all four agents, or update the scheduled OpenClaw auth-profile cron workflow.
---

# OpenClaw Auth Profile Skill

This skill preserves four separate OpenClaw agent auth profile stores and only repairs runtime auth-state health plus sticky session auth pins before smoke testing.

## Hard Rules

- Treat these four agents as separate accounts with separate auth profile files:
  - `clawdbot_agent`
  - `main-cron`
  - `openclawy_agent`
  - `moltbot_agent`
- Never copy, sync, overwrite, normalize, reorder, import, export, login, refresh, rotate, or otherwise change any `auth-profiles.json`.
- Read each agent's own `auth-profiles.json` only to derive that same agent's OpenAI Codex profile count/order for `auth-state.json`; never use one agent's profile IDs for another agent.
- Never use the old source-of-truth workflow where `clawdbot_agent` profiles are copied to other agents.
- Never run old Codex multi-auth sync, placeholder-refresh, or profile-copy scripts.
- Clear sticky `authProfileOverride*` pins from `agents\<agentId>\sessions\sessions.json` so sessions cannot stay pinned to stale or shared profiles.
- Only change runtime files: rebuild `agents\<agentId>\agent\auth-state.json` from that agent's own profile IDs and remove `authProfileOverride*` fields from `agents\<agentId>\sessions\sessions.json`.
- Back up each changed `auth-state.json` before writing it.
- Back up each changed `sessions.json` before writing it.
- Verify profile files are unchanged with safe before/after hash checks.
- Do not print profile IDs, emails, tokens, auth JSON, account payloads, raw `auth-state.json`, or raw model outputs.

## Run

Run from `C:\Users\User\.openclaw`.

```powershell
node workspace\skills\openclaw-auth-profile\scripts\recover-auth-state-and-smoke-test.mjs --apply --smoke
```

If smoke tests fail only because the running gateway still holds an in-memory OpenAI Codex cooldown, restart the gateway only when the user or cron prompt explicitly permits it:

```powershell
node workspace\skills\openclaw-auth-profile\scripts\recover-auth-state-and-smoke-test.mjs --apply --smoke --restart-gateway-on-cooldown
```

## Expected Smoke Test

Run one serialized prompt per agent:

```text
NON_SECRET_SMOKE_TEST: reply exactly SMOKE_OK and nothing else.
```

Pass criteria:

- Each agent returns `SMOKE_OK`.
- No `auth refresh request timed out after 10s`.
- No `Missing API key`.
- No `Provider openai-codex is in cooldown` after an explicitly permitted gateway restart/retry.
- Profile hash checks report unchanged for every existing `auth-profiles.json`.

## Reporting

Report only safe metadata: agent IDs, per-agent profile counts, auth-state changed flags, removed runtime-field counts, cleared session-pin counts, backup paths, smoke pass/fail, cooldown/restart status, and profile-unchanged booleans. Never report credential data, raw profile JSON, raw auth-state JSON, profile IDs, emails, access tokens, refresh tokens, or full account payloads.
