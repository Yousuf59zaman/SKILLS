---
name: route-openclaw-models-by-task
description: Audit, repair, and test OpenClaw dynamic model selection by task category. Use when the three user agents must route coding to GLM-5.2, vision/browser/MCP/CLI/docs to Qwen 3.7 Plus, planning/security/review to Qwen 3.7 Max, video to MiniMax M3, while main-cron remains MiniMax M3-only.
---

# Route OpenClaw Models by Task

Apply this routing contract only to `clawdbot_agent`, `openclawy_agent`, and `moltbot_agent`:

| Task | Primary model |
|---|---|
| Coding, implementation, debugging | `opencode-go/glm-5.2` |
| Vision, screenshots, OCR | `opencode-go/qwen3.7-plus` |
| Browser, MCP, CLI, tool-heavy work | `opencode-go/qwen3.7-plus` |
| Documentation and reports | `opencode-go/qwen3.7-plus` |
| Planning and supervision | `opencode-go/qwen3.7-max` |
| Security, review, and QA | `opencode-go/qwen3.7-max` |
| Video, reels, and clips | `opencode-go/minimax-m3` |

Route every `main-cron` task to `opencode-go/minimax-m3`; do not apply the dynamic user-agent router to it.

## Canonical Implementation

Use these files:

```text
C:\Users\User\.openclaw\workspace\plugins\task-complexity-router\route-policy.js
C:\Users\User\.openclaw\workspace\plugins\task-complexity-router\classifier.js
C:\Users\User\.openclaw\workspace\plugins\task-complexity-router\index.js
```

Keep `task-complexity-router` enabled in `openclaw.json`. Detect current-message media; never let media retained from an old Telegram turn force a later text-only request onto a vision route.

## Workflow

1. Audit the model catalog, agent scope, plugin enabled state, and route table.
2. Back up only files that require changes.
3. Modify classification or route policy narrowly. Do not edit auth profiles.
4. Verify syntax and deterministic route tests:

```powershell
node --check "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\route-policy.js"
node --check "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\classifier.js"
node --check "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\index.js"
node "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\smoke-test.mjs"
node "$env:USERPROFILE\.openclaw\workspace\plugins\task-complexity-router\route-matrix-test.mjs"
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
```

5. Run fresh-session live probes for representative coding, visual, tool-heavy, planning, security, docs, video, and cron prompts. Confirm the selected model from logs or JSON.

## Guardrails

- Route selection changes models, not auth profiles.
- Do not force a reasoning level that a selected model does not support.
- Do not use global MiniMax-first fallback; preserve category separation.
- Do not change `main-cron` auth or user-agent default profiles.

