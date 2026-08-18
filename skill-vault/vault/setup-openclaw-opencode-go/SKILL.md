---
name: setup-openclaw-opencode-go
description: Configure and repair direct OpenCode Go usage in OpenClaw without Relay AI. Use when DeepSeek V4 Flash must remain the third ordinary-chat route, browser and cron tasks must stay on Luna, OpenCode model capability metadata is wrong, or OpenClaw has drifted to an unauthorized provider/model order.
---

# Setup OpenClaw OpenCode Go

Keep OpenClaw on its native `opencode-go` provider. Do not route OpenClaw through Relay AI.

## Required State

- `clawdbot_agent`, `openclawy_agent`, `moltbot_agent`, and `molty-59`: `omniroute/oc/deepseek-v4-flash-free` primary, then Zen DeepSeek, then `opencode-go/deepseek-v4-flash` third overall, then OpenRouter, with Big Pickle last; keep full tools.
- Explicit browser/web actions use `opencode-go/gpt-5.6-luna`.
- Every `main-cron` agent-turn payload uses `opencode-go/gpt-5.6-luna`, `thinking=high`, and exactly `fallbacks=["opencode-go/minimax-m3"]`; keep cron outside user-agent auth rotation.
- Model capabilities:
  - `deepseek-v4-flash`: text, reasoning, 1,000,000 context, 384,000 max output, DeepSeek thinking replay.
  - `glm-5.2`, `qwen3.7-max`, `kimi-k2.7-code`: text.
  - `qwen3.7-plus`: text and image.
  - `minimax-m3`: text, image, and video.
- Store credentials only in OpenClaw auth storage. Never print or copy API keys into logs or skill files.

## Workflow

1. Back up only files that require changes, including current and last-good config.
2. Audit/apply the canonical routing enforcer:

```powershell
node "$env:USERPROFILE\.openclaw\workspace\skills\openclaw\scripts\ensure-openclaw-model-routing.mjs"
node "$env:USERPROFILE\.openclaw\workspace\skills\openclaw\scripts\ensure-openclaw-model-routing.mjs" --apply
```

3. Inspect `main-cron` separately and preserve Luna/high with MiniMax M3 as the only explicit payload fallback. Never include it in user-agent auth rotation.
4. Validate before restarting:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
& "$env:APPDATA\npm\openclaw.cmd" health --json
```

5. Restart the supervised Gateway only when runtime config changed. Run one fresh, non-secret no-delivery smoke prompt per agent and confirm actual provider/model from structured output, not from the reply label alone.

## Guardrails

- Preserve unknown config fields and plugin entries.
- Do not read auth file contents unless credential diagnosis is explicitly requested.
- Do not promote OpenCode Go DeepSeek above third place or move Big Pickle above last place.
- Do not change browser/media or cron Luna routing while repairing ordinary chat.
- Do not modify Codex Desktop or Relay AI configuration from this child skill.
- Treat upstream `429`, `503`, and quota errors as provider/account health problems, not evidence that direct routing is misconfigured.

