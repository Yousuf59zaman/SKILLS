---
name: route-openclaw-models-by-task
description: Audit, repair, and test OpenClaw routing so explicit browser/web actions use GPT-5.6 Luna while ordinary text, bare URLs, Second Brain link saves, and non-browser tool work preserve each user-facing agent's configured OmniRoute primary. Use when browser, Google Drive upload/download, site navigation, login, scraping, explicit URL inspection, or clicks fail to select Luna; when mere keywords or save/bookmark/queue links incorrectly select OpenCode Go; or when cron/media Luna routing must remain isolated.
---

# Route OpenClaw Models by Task

Keep model ownership explicit and fail closed.

## Current Contract

- `clawdbot_agent`, `openclawy_agent`, `moltbot_agent`, and `molty-59` use their configured `omniroute/oc/deepseek-v4-flash-free` primary for normal text, MCP, CLI, filesystem, coding, planning, review, security, documentation, and other non-browser work.
- Their configured fallbacks are `zen-free/deepseek-v4-flash-free`, then `opencode-go/deepseek-v4-flash` (third overall), then `openrouter/free`, with `omniroute/oc/big-pickle` strictly last.
- Explicit browser/web actions use `opencode-go/gpt-5.6-luna`: browser/Chrome control, site navigation, login, scraping, explicit URL inspection, clicks/forms, and remote upload/download/post actions.
- Keywords such as Google, Drive, browser, GitHub, Facebook, URL, upload, MCP, or CLI do not trigger Luna without a concrete web action.
- Treat a bare URL or `save/remember/bookmark/archive/queue/drop <link>` as Second Brain/ordinary intent and keep it on OmniRoute. If the same request explicitly says open/visit/login/click/scrape/check, direct browser intent wins and uses Luna.
- Keep `tools.profile="full"`; tool access is independent of model selection.
- Actual media may use the separate `agents.defaults.imageModel` route.
- Every `main-cron` agent-turn payload remains explicitly pinned to `opencode-go/gpt-5.6-luna` with `thinking=high` and exactly `fallbacks=["opencode-go/minimax-m3"]`; it must not inherit ordinary text fallbacks.
- A user-requested explicit one-off model override is allowed.

## Runtime Ownership

- Keep `browser-media-router` enabled in plugin entries/load/allow, restricted to the four user agents and the exact Luna route, and prevent raw-prompt logging.
- Keep `task-complexity-router` dormant unless Yousuf explicitly changes a user agent to its managed OpenCode primary.
- Keep global and user-agent `thinkingDefault` at `high`; the configured OmniRoute primary rejects `xhigh`.
- Ensure the route-safe fallback runtime returns the original candidate list whenever the actual primary provider is not `opencode-go`, even if route-state exists.
- Do not let retained media metadata from an earlier Telegram turn change a later text-only route.

## Workflow

1. Audit agent primaries/fallbacks, cron payloads, plugin load/allow/enable state, every active `providerOverride`/`modelOverride`, layered Second Brain-versus-browser intent handling, route-state handling, and policy sources.
2. Back up only files that require changes.
3. Modify routing narrowly; never edit auth profiles.
4. Run:

```powershell
node --check "$env:USERPROFILE\.openclaw\workspace\plugins\browser-media-router\index.js"
node "$env:USERPROFILE\.openclaw\workspace\plugins\browser-media-router\smoke-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\smoke-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\route-matrix-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\scripts\openclaw-user-routing-invariant-test.mjs"
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
```

5. Restart the real supervised Gateway process when config/plugin/runtime files changed. Verify health, loaded plugin inventory, main-cron payloads, and fresh no-delivery routing probes for all four user-facing agents.

## Live-Probe Safety

- Use prompts that mention risky keywords but explicitly say not to use tools or perform uploads.
- Confirm the selected provider/model from sanitized JSON or logs; never expose keys, profile hashes, workspace IDs, or raw auth data.
- Do not trigger real cron work or external uploads merely to test routing.

## Guardrails

- Do not touch auth profiles, OAuth state, API keys, or tokens.
- Keep only `opencode-go/deepseek-v4-flash` in the ordinary chain, exactly third overall. Do not promote it above Zen or add browser/media OpenCode models to ordinary fallbacks.
- Preserve the explicit `main-cron` Luna/high primary and its single MiniMax M3 fallback while repairing user routing.
- Do not claim completion from static config alone; require deterministic tests plus fresh post-restart runtime evidence.
