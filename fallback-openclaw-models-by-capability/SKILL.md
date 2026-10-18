---
name: fallback-openclaw-models-by-capability
description: Create and verify capability-compatible OpenClaw fallbacks while preserving the active Muse-first ordinary and browser/media/cron chains. Use when a route fails with 429, 5xx, timeout, policy, or provider unavailability and its ordered fallback must still satisfy the task's text, image, video, tool, or cron requirements.
---

# Capability-Safe OpenClaw Fallbacks

Never replace a failed model with one that cannot consume the current request's media or perform the required category.

## Fallback Contract

- Active ordinary work: `opencode-go/muse-spark-1.3-contributor` → `omniroute/oc/deepseek-v4-flash-free` → `zen-free/deepseek-v4-flash-free` → `opencode-go/deepseek-v4-flash` → `openrouter/free` → `omniroute/oc/big-pickle`.
- Active explicit browser, attached media, and every `main-cron` agent turn: Muse → `opencode-go/deepseek-v4-flash-vision-exp` → `opencode-go/gpt-5.6-luna` → `opencode-go/qwen3.7-plus` → `opencode-go/minimax-m3`, with the runtime-clamped `thinking=ultra` ceiling for cron.
- The active chains above preserve each route's complete former primary-plus-fallback order. Do not replace them with the dormant task-complexity categories below.
- The following category chains apply only when the disabled `task-complexity-router` is explicitly re-enabled with its own managed primary:
- Coding: GLM-5.2 → Kimi K2.7 Code → Qwen 3.7 Max → MiniMax M3 → Qwen 3.7 Plus.
- Planning, review, security: Qwen 3.7 Max → Qwen 3.7 Plus → MiniMax M3 → GLM-5.2 → Kimi K2.7 Code.
- Raw image, screenshot, OCR: Qwen 3.7 Plus → MiniMax M3 only.
- Browser/MCP/CLI: Qwen 3.7 Plus → MiniMax M3 first. Continue to text-only models only when the current turn has no image/video dependency.
- Documentation: Qwen 3.7 Plus → Qwen 3.7 Max → GLM-5.2 → Kimi K2.7 Code → MiniMax M3.
- Raw video: MiniMax M3 only; there is no second video-capable model in the approved set.

## Canonical Implementation

Keep category fallbacks in:

```text
C:\Users\User\.openclaw\workspace\plugins\task-complexity-router\route-policy.js
```

Keep runtime route-state enforcement in:

```text
C:\Users\User\.openclaw\workspace\scripts\openclaw-route-safe-fallback-guard.mjs
```

Keep the live ordinary/browser/image/cron contract in:

```text
C:\Users\User\.openclaw\workspace\skills\openclaw\scripts\ensure-openclaw-model-routing.mjs
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

- The five task-complexity model families listed above are restricted to that dormant router. They must not replace or reorder either active Muse-first chain.
- Do not claim a text-only model supports image or video input.
- Do not mask the final provider error when every compatible candidate fails.
- Muse Contributor is not ZDR and may use prompts/completions for training. Require explicit user consent plus a successful no-tool provider canary before first live activation or after a material policy change. Fail closed unless the canonical non-secret readiness attestation verifies the exact model, consent, current-workspace opt-in, and passed canary.
