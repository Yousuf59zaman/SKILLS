---
name: openclaw-codex-routing-speed
description: Diagnose and repair OpenClaw OpenAI Codex routing after updates using the current openai-codex/gpt-5.4-mini route, safe plugin checks, stale session cleanup, and non-token speed tuning while preserving xhigh thinking and fastMode off by default. Use only with the exact auth approval phrase before reading or testing auth profiles, auth order, OAuth state, auth-state, or model probes.
---

# OpenClaw Codex Routing And Speed

Use this skill when OpenClaw agents show missing API-key warnings, stale direct OpenAI routing, wrong Codex model selection, auth-state cooldown drift, or slow Telegram/chat replies after an update.

## Auth Safety

Auth storage is protected. Before reading, editing, probing, testing, reordering, or repairing auth profiles, auth order, OAuth state, auth-state, token caches, `models.json`, Codex multi-auth, or profile-specific live model routing, require:

```text
I APPROVE AUTH CHANGE: <exact action>
```

Do not refresh, login, logout, delete, reorder, or expose token values unless that exact operation is named.

## Canonical Route

Current proven route for Yousuf's OpenClaw chat/cron agents:

- `agents.defaults.model.primary` = `openai-codex/gpt-5.4-mini`
- task-complexity SIMPLE = `openai-codex/gpt-5.4-mini`
- task-complexity COMPLEX = `openai-codex/gpt-5.4-mini` unless `OPENCLAW_COMPLEX_GPT_MODEL` is explicitly set
- `agents.defaults.model.fallbacks` = `[]`
- Telegram/chat tests should not be routed to `gpt-5.5` by default

## Safe Recovery Order

1. Validate config/status without printing secrets.
2. Verify plugin wiring: `task-complexity-router`, `openai-codex-auth-state-recovery`, `telegram-agent-route-guard`, and `model-reply-labeler`.
3. Run `node C:\Users\User\.openclaw\workspace\skills\openclaw\scripts\ensure-openclaw-model-routing.mjs` for dry-run routing drift.
4. If auth-state drift is approved, run `node C:\Users\User\.openclaw\workspace\skills\openclaw-auth-profile\scripts\recover-openai-codex-auth-state.mjs --apply`.
5. Restart Gateway only if Yousuf approves restart or the current task explicitly includes restart.
6. Test Telegram routing with each agent's own account, not forced `clawdbot`.

## Live Test Pattern

Only run live profile/model tests with exact approval. Keep tests serialized.

- Use `openai-codex/gpt-5.4-mini`.
- Use explicit `--agent <agentId>`.
- Use own Telegram account for delivery proof:
  - `clawdbot_agent` -> `clawdbot`
  - `openclaw_agent` -> `openclaw`
  - `moltbot_agent` -> `moltbot`
- Do not claim Telegram readback from `openclaw message read`; Telegram read is unsupported.

## Speed Recovery

- Preserve `thinkingDefault: "xhigh"` unless Yousuf explicitly approves lowering thinking.
- Keep `fastModeDefault: false` and `fastMode: false` unless Yousuf explicitly approves fast mode.
- Reduce OpenClaw overhead first: smaller bootstrap/context, minimal tools for Telegram/chat agents, stale session cleanup with approval when protected.
- Treat slow Codex OAuth startup as real latency; do not hide it by silently switching providers or adding non-Codex fallbacks.

## Verification

Always finish with:

```powershell
openclaw config validate --json
openclaw gateway status --json
openclaw gateway health --json --timeout 60000
node C:\Users\User\.openclaw\workspace\plugins\task-complexity-router\smoke-test.mjs
node C:\Users\User\.openclaw\workspace\plugins\openai-codex-auth-state-recovery\smoke-test.mjs
```

Never include token values, API keys, refresh tokens, access tokens, id tokens, raw auth-state JSON, or raw profile payloads in the response.
