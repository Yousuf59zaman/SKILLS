---
name: setup-openclaw-opencode-go
description: Configure and repair direct OpenCode Go usage in OpenClaw without Relay AI. Use when clawdbot_agent, openclawy_agent, or moltbot_agent must default to GLM-5.2, when main-cron must remain separately pinned to MiniMax M3, when model capability metadata is wrong, or when OpenClaw has drifted back to an OpenAI Codex or Relay-backed provider.
---

# Setup OpenClaw OpenCode Go

Keep OpenClaw on its native `opencode-go` provider. Do not route OpenClaw through Relay AI.

## Required State

- `clawdbot_agent`, `openclawy_agent`, and `moltbot_agent`: primary `opencode-go/glm-5.2` with full tools.
- `main-cron`: primary `opencode-go/minimax-m3`, separate from user-agent routing and auth rotation.
- Model capabilities:
  - `glm-5.2`, `qwen3.7-max`, `kimi-k2.7-code`: text.
  - `qwen3.7-plus`: text and image.
  - `minimax-m3`: text, image, and video.
- Store credentials only in OpenClaw auth storage. Never print or copy API keys into logs or skill files.

## Workflow

1. Back up `C:\Users\User\.openclaw\openclaw.json` with a timestamp.
2. Audit with the canonical helper:

```powershell
node "$env:USERPROFILE\.codex\skills\opencode-sync\scripts\opencode-sync.mjs" --target openclaw --json
```

3. Apply only to the three user agents when direct OpenCode Go setup is missing:

```powershell
node "$env:USERPROFILE\.codex\skills\opencode-sync\scripts\opencode-sync.mjs" --target openclaw --default-model glm-5.2 --vision-model qwen3.7-plus --agents clawdbot_agent,openclawy_agent,moltbot_agent --apply
```

4. Inspect `main-cron` separately. Preserve `opencode-go/minimax-m3` and empty model fallbacks; never include it in user-agent auth rotation.
5. Validate before restarting:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
& "$env:APPDATA\npm\openclaw.cmd" health --json
```

6. Run one fresh, non-secret smoke prompt per agent. Confirm actual provider/model from structured output, not from the reply label alone.

## Guardrails

- Preserve unknown config fields and plugin entries.
- Do not read auth file contents unless credential diagnosis is explicitly requested.
- Do not modify Codex Desktop or Relay AI configuration from this child skill.
- Treat upstream `429`, `503`, and quota errors as provider/account health problems, not evidence that direct routing is misconfigured.

