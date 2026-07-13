---
name: bypass-opencode-go-cooldown
description: Audit and reapply the OpenClaw runtime guard that prevents transient OpenCode Go failures from placing the entire provider into a self-suspending cooldown. Use after an OpenClaw update or when logs say Provider opencode-go is in cooldown, suspending lanes, skip_candidate, or all models failed immediately after a 429, 503, timeout, or connection error.
---

# Bypass OpenCode Go Cooldown

Prevent OpenClaw from blocking the whole `opencode-go` provider after one candidate fails. Continue to surface genuine upstream errors and let model/auth fallbacks handle them.

## Canonical Guard

```text
C:\Users\User\.openclaw\workspace\scripts\opencode-go-no-cooldown-guard.mjs
```

This guard is version-sensitive because it patches the installed OpenClaw runtime. Read it before execution and confirm its target anchors still exist after an OpenClaw update.

## Workflow

1. Back up the target runtime file if the guard will patch it.
2. Check and apply:

```powershell
node --check "$env:USERPROFILE\.openclaw\workspace\scripts\opencode-go-no-cooldown-guard.mjs"
node "$env:USERPROFILE\.openclaw\workspace\scripts\opencode-go-no-cooldown-guard.mjs"
Get-Content "$env:USERPROFILE\.openclaw\workspace\logs\opencode-go-no-cooldown-guard.log" -Tail 20
```

3. Ensure the gateway supervisor invokes the guard before gateway start so package updates cannot silently remove the patch.
4. Restart the gateway once and verify that an OpenCode Go candidate failure proceeds to the allowed fallback rather than `skip_candidate ... provider is in cooldown`.
5. Confirm cooldown behavior for unrelated providers is unchanged.

## Guardrails

- Bypass only OpenClaw's local provider-wide cooldown for `opencode-go`.
- Do not bypass upstream quotas, retry limits, account blocks, or billing limits.
- Never loop retries indefinitely. Respect task-level candidate exhaustion.
- Never print credentials or auth file contents.
- Audit the guard's additional config assertions before running it; preserve the user-agent/main-cron routing contract.

