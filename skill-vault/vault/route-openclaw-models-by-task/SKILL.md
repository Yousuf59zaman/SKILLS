---
name: route-openclaw-models-by-task
description: Audit, repair, and test OpenClaw routing so Muse Spark 1.3 Contributor is primary for ordinary work, explicit browser/web actions, attached media, and main-cron, while each route preserves its complete former primary-plus-fallback order behind Muse.
---

# Route OpenClaw Models by Task

Keep model ownership explicit and fail closed.

## Current Contract

- `clawdbot_agent`, `openclawy_agent`, `moltbot_agent`, and `molty-59` use `opencode-go/muse-spark-1.3-contributor` for normal text, MCP, CLI, filesystem, coding, planning, review, security, documentation, and other non-browser work.
- Their ordinary fallbacks preserve the complete former order: `omniroute/oc/deepseek-v4-flash-free`, `zen-free/deepseek-v4-flash-free`, `opencode-go/deepseek-v4-flash`, `openrouter/free`, then `omniroute/oc/big-pickle`.
- Explicit browser/web actions use Muse, then the complete former browser chain: `opencode-go/deepseek-v4-flash-vision-exp`, `opencode-go/gpt-5.6-luna`, `opencode-go/qwen3.7-plus`, and `opencode-go/minimax-m3`: browser/Chrome control, site navigation, login, scraping, explicit URL inspection, clicks/forms, and remote upload/download/post actions.
- The specialized chain controls OpenClaw's native browser first. The guarded `gpt-5.6-sol`/`xhigh` Codex CLI route is a host-only fallback after the full native model chain fails before side effects or a definitive replay-safe native-browser failure; never invoke it after CAPTCHA/login/2FA/cancellation, a successful native mutation, or an uncertain native write/click/submit/upload/download.
- Keywords such as Google, Drive, browser, GitHub, Facebook, URL, upload, MCP, or CLI do not trigger the specialized route without a concrete web action.
- Treat a bare URL or `save/remember/bookmark/archive/queue/drop <link>` as Second Brain/ordinary intent and keep it on the ordinary Muse-first chain. If the same request explicitly says open/visit/login/click/scrape/check, direct browser intent wins and selects the browser fallback chain.
- Keep `tools.profile="full"`; tool access is independent of model selection.
- Actual attached images use the separate `agents.defaults.imageModel` route with Muse followed by the former specialized chain.
- Every `main-cron` agent-turn payload is explicitly pinned to Muse with the runtime-clamped `thinking=ultra` ceiling and exactly `fallbacks=["opencode-go/deepseek-v4-flash-vision-exp","opencode-go/gpt-5.6-luna","opencode-go/qwen3.7-plus","opencode-go/minimax-m3"]`; it must not inherit ordinary text fallbacks.
- A user-requested explicit one-off model override is allowed.

## Runtime Ownership

- Keep `browser-media-router` enabled in plugin entries/load/allow, restricted to the four user agents and the exact Muse-first browser chain, and prevent raw-prompt logging. Preserve `delegateMode="native-fallback"`; leave `delegateEnabled=false` until doctor plus hook/current-Chrome/isolated-browser live attestation pass with at least one eligible Codex profile.
- Keep `task-complexity-router` dormant unless Yousuf explicitly changes a user agent to its managed OpenCode primary.
- Keep global, every configured agent, every configured OpenCode model entry, and every `main-cron` payload at the `ultra` ceiling. OpenClaw must revalidate every initial/fallback candidate and clamp it to its advertised maximum.
- Ensure the route-safe fallback runtime gives Muse the ordinary chain by default and uses browser route-state only for an exact current run. A stale session record must never change a later ordinary task.
- Do not let retained media metadata from an earlier Telegram turn change a later text-only route.

## Workflow

1. Audit agent primaries/fallbacks, cron payloads, plugin load/allow/enable state, every active `providerOverride`/`modelOverride`, layered Second Brain-versus-browser intent handling, route-state handling, and policy sources.
2. Back up only files that require changes.
3. Modify routing narrowly; never edit auth profiles.
4. Run:

```powershell
node --check "$env:USERPROFILE\.openclaw\workspace\plugins\browser-media-router\index.js"
node "$env:USERPROFILE\.openclaw\workspace\skills\openclaw\scripts\ensure-openclaw-model-routing.test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\browser-media-router\smoke-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\browser-media-router\level3-stress-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\smoke-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\route-matrix-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\scripts\openclaw-muse-fallback-runtime-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\scripts\openclaw-max-thinking-invariant-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\scripts\openclaw-user-routing-invariant-test.mjs"
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
```

5. Restart the real supervised Gateway process when config/plugin/runtime files changed. Verify health, loaded plugin inventory, main-cron payloads, and fresh no-delivery routing probes for all four user-facing agents.

On Windows, verify a real Gateway PID change and the live `agents.list` model values: a service/launcher restart acknowledgement alone is insufficient. Use Gateway-aware safe restart after its active-work preflight is clear; never force active tasks. Also inspect saved session model overrides through the public session-store SDK, and migrate only overrides for the replaced checkpoint through `sessions.patch`, leaving history and unrelated auth/delivery fields alone.

## Live-Probe Safety

- Use prompts that mention risky keywords but explicitly say not to use tools or perform uploads.
- Confirm the selected provider/model from sanitized JSON or logs; never expose keys, profile hashes, workspace IDs, or raw auth data.
- Do not trigger real cron work or external uploads merely to test routing.

## Guardrails

- Do not touch auth profiles, OAuth state, API keys, or tokens.
- Preserve each former route exactly behind Muse: ordinary work gets the old OmniRoute primary followed by its old fallbacks; browser/media/cron gets the old DeepSeek Vision primary followed by its old fallbacks.
- Muse Contributor is not ZDR and may use prompts/completions for training. Require explicit user consent and a successful no-tool provider canary before first live activation or reactivation after a material data-policy change. Persist only a non-secret exact-model/consent/current-workspace-opt-in/canary attestation, and make the canonical enforcer fail closed on production apply when it is absent or invalid.
- Do not claim completion from static config alone; require deterministic tests plus fresh post-restart runtime evidence.
