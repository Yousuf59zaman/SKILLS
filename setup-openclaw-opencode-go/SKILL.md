---
name: setup-openclaw-opencode-go
description: Configure and repair direct OpenCode Go usage in OpenClaw without Relay AI. Use when Muse Spark 1.3 Contributor must be primary for ordinary, browser/media, and cron work; its complete former route chains must remain ordered fallbacks; model capability metadata is wrong; or OpenClaw has drifted to an unauthorized provider/model order.
---

# Setup OpenClaw OpenCode Go

Keep OpenClaw on its native `opencode-go` provider. Do not route OpenClaw through Relay AI.

## Required State

- `clawdbot_agent`, `openclawy_agent`, `moltbot_agent`, and `molty-59`: Muse primary, then the complete former ordinary chain—OmniRoute DeepSeek free, Zen DeepSeek free, OpenCode DeepSeek Flash, OpenRouter free, and Big Pickle last; keep full tools.
- Explicit browser/web actions and attached media use Muse, then the complete former specialized chain—DeepSeek V4 Flash Vision Exp, Luna, Qwen 3.7 Plus, and MiniMax M3.
- Every `main-cron` agent-turn payload uses Muse, `thinking=ultra` as a runtime-clamped maximum ceiling, and exactly that same ordered specialized fallback list; keep cron outside user-agent auth rotation.
- Model capabilities:
  - `deepseek-v4-flash`: text, reasoning, 1,000,000 context, 384,000 max output, DeepSeek thinking replay.
  - `muse-spark-1.3-contributor`: Responses API; text, image, video, audio; tools and reasoning; 1,048,576 context; 131,072 max output; minimal/low/medium/high/xhigh.
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

3. Inspect `main-cron` separately and preserve Muse with the `ultra` ceiling and ordered DeepSeek Vision, Luna, Qwen, and MiniMax fallbacks. Keep global/per-agent/configured-OpenCode entries at the same ceiling and verify that OpenClaw clamps each selected model to its advertised maximum. Never include cron in user-agent auth rotation.
4. Validate before restarting:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
& "$env:APPDATA\npm\openclaw.cmd" health --json
```

5. Restart the supervised Gateway only when runtime config changed. Run one fresh, non-secret no-delivery smoke prompt per agent and confirm actual provider/model from structured output, not from the reply label alone.

On this Windows supervisor setup, a plain service-restart acknowledgement can mean only that a duplicate launcher started. Check `gateway.restart.preflight`, use the Gateway-aware safe restart when idle, and verify the owning process changed plus `agents.list` reports the new runtime primary. Do not force an active run to finish a model upgrade.

## Guardrails

- Preserve unknown config fields and plugin entries.
- Do not read auth file contents unless credential diagnosis is explicitly requested.
- Preserve each complete former route behind Muse; do not reorder the old ordinary or specialized candidates.
- Do not collapse browser/media/cron onto the ordinary fallback chain.
- Do not modify Codex Desktop or Relay AI configuration from this child skill.
- Treat upstream `429`, `503`, and quota errors as provider/account health problems, not evidence that direct routing is misconfigured.
- Muse Contributor is not ZDR and may use prompts/completions for training. Require explicit user consent and a successful no-tool provider canary before first activation or reactivation after a material policy change. The production enforcer must validate a non-secret attestation for the exact model, consent, current-workspace opt-in, and passed canary before writing.

