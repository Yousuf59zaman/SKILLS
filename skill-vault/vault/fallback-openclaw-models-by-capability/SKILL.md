---
name: fallback-openclaw-models-by-capability
description: Create and verify capability-compatible OpenClaw model fallbacks using only GLM-5.2, Qwen 3.7 Plus, Qwen 3.7 Max, MiniMax M3, and Kimi K2.7 Code. Use when a vision fallback must remain image-capable, a video fallback must remain video-capable, or a route fails with 429, 5xx, timeout, or provider unavailability and its fallback must still satisfy coding, browser, MCP, CLI, documentation, planning, review, security, or cron requirements.
---

# Capability-Safe OpenClaw Fallbacks

Never replace a failed model with one that cannot consume the current request's media or perform the required category.

## Fallback Contract

- Coding: GLM-5.2 → Kimi K2.7 Code → Qwen 3.7 Max → MiniMax M3 → Qwen 3.7 Plus.
- Planning, review, security: Qwen 3.7 Max → Qwen 3.7 Plus → MiniMax M3 → GLM-5.2 → Kimi K2.7 Code.
- Raw image, screenshot, OCR: Qwen 3.7 Plus → MiniMax M3 only.
- Browser/MCP/CLI: Qwen 3.7 Plus → MiniMax M3 first. Continue to text-only models only when the current turn has no image/video dependency.
- Documentation: Qwen 3.7 Plus → Qwen 3.7 Max → GLM-5.2 → Kimi K2.7 Code → MiniMax M3.
- Raw video: MiniMax M3 only; there is no second video-capable model in the approved set.
- `main-cron`: MiniMax M3 only, no model fallback.

## Canonical Implementation

Keep category fallbacks in:

```text
C:\Users\User\.openclaw\workspace\plugins\task-complexity-router\route-policy.js
```

Keep runtime route-state enforcement in:

```text
C:\Users\User\.openclaw\workspace\scripts\openclaw-route-safe-fallback-guard.mjs
```

The selected fallback list must remain locked to the current task category for the whole run. Auth-profile rotation is independent and must not reorder these models.

## Verification

```powershell
node --check "$env:USERPROFILE\.openclaw\workspace\scripts\openclaw-route-safe-fallback-guard.mjs"
node "$env:USERPROFILE\.openclaw\workspace\scripts\openclaw-route-safe-fallback-guard.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\route-matrix-test.mjs"
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
```

Test at least: attached image, screenshot path, stale old image followed by text, video URL, coding request, browser without media, browser with screenshot, docs, security review, and `main-cron`.

## Guardrails

- Use only the five approved model families listed in this skill.
- Do not claim a text-only model supports image or video input.
- Do not mask the final provider error when every compatible candidate fails.
- Do not add model fallbacks to `main-cron`.
