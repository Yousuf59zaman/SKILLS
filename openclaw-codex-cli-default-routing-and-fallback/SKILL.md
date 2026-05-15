---
name: openclaw-codex-cli-default-routing-and-fallback
description: "Enforce OpenClaw codex-cli as the default routing path across web chat, terminal, Telegram, Discord, and other channels, while enforcing cron exceptions to run on codex-api and only using codex-cli as an automatic fallback when a cron run truly fails. Use when default model drifts to g3/g3-flash, when logs must show `agent/claude-cli` with `provider=codex-cli model=gpt-5.3-codex` for normal channels, when cron jobs must stay off codex-cli, or when `codex exec resume` throws `unexpected argument ... found`."
---

# OpenClaw Codex CLI Default Routing and Fallback

## Overview

Keep codex-cli as the always-on default route for incoming prompts and maintain reliability during browser-control-service outages.
Enforce cron exceptions so scheduled automations run with codex-api by default, and codex-cli is used only as automatic fallback after real cron execution failures.

## Workflow

1. Confirm routing and health:
```powershell
openclaw models status --json
openclaw gateway status --json
openclaw browser status --json
```
If the default model is not `codex-cli/gpt-5.3-codex`, run:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-openclaw-codex-default-model.ps1
```
Then confirm aliases and routing intent:
- `codex` should resolve to `codex-cli/gpt-5.3-codex`
- `g3` and `g3-flash` should stay available only for explicit user switches
- `fallbacks` should remain empty unless explicitly configured

2. Keep policy synced with codex-cli-first routing:
- Default route must remain codex-cli across interactive channels.
- Never auto-switch to `g3` or `g3-flash`.
- Switch away from codex-cli only when user explicitly asks.
- If config/policy files were edited, restart gateway:
```powershell
openclaw gateway restart
```

3. Apply cron exception hardening (cron uses codex-api; codex-cli only on real cron failure fallback):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\apply-openclaw-cron-exception-hardening.ps1
```
Optional:
- `-DisableStartNoticeDelivery` to silence start-notice announce delivery noise
- `-SkipDirectAnnounceTimeoutPatch` to skip runtime direct-announce timeout patch
- `-SkipGatewayRestart` to defer restart

This enforces:
- Daily Automation Start at `11:04` (`4 11 * * *`, Asia/Dhaka)
- All cron `agentTurn` jobs pinned to `codex-api`
- Guard jobs as `--no-deliver`
- codex-cli resume-safe stdin settings (`input=stdin`, `maxPromptArgChars=1`)

4. Detect failover window from logs:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\show-codex-cli-fallback-status.ps1
```
Use this report to confirm:
- browser service failure exists
- codex-cli exec attempts exist
- delivery success (`sendMessage ok`) exists after codex-cli execution for the originating channel

5. Execute Codex CLI fallback with prompt-safe stdin passing:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\invoke-codex-exec-resume-safe.ps1 `
  -Last `
  -Prompt "Automation task: summarize outage and continue workflow." `
  -Model "gpt-5.3-codex"
```

6. Verify post-run delivery:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\show-codex-cli-fallback-status.ps1 -Recent 30
```
Expect a sequence of:
- `BrowserServiceFail`
- `CliExecCodex`
- `ChannelDeliveryOk`

7. Handle recurring failures:
- If browser remains unavailable, use `$openclaw-browser-blocker-recovery`.
- If codex-cli auth/profile routing issues appear, use `$openclaw-codex-multi-account-failover`.
- If `unexpected argument` appears again, do not pass multi-word prompts as raw positional CLI args; keep stdin mode.

## Key Rule

Always keep codex-cli as the primary interactive route unless the user explicitly switches models.
Cron jobs must run on codex-api by default.
Use codex-cli for cron only when a real cron execution fails and immediate fallback retry is required.
Delivery-only announce failures must not trigger codex cron fallback.
Always pass resume prompts through stdin (`-`) when automating `codex exec resume`.
This avoids tokenization bugs where prompt words are interpreted as extra positional arguments.

## Resources

### scripts/
- `scripts\apply-openclaw-cron-exception-hardening.ps1`
  Enforce codex-cli default routing plus cron exception hardening (codex-api for cron, 11:04 daily start, failure-only codex fallback checks).
- `scripts\show-codex-cli-fallback-status.ps1`
  Parse OpenClaw logs and classify failover windows and outcomes.
- `scripts\invoke-codex-exec-resume-safe.ps1`
  Invoke `codex exec resume` in safe stdin mode.
- `scripts\set-openclaw-codex-default-model.ps1`
  Enforce and verify `codex-cli/gpt-5.3-codex` as the OpenClaw default model.

### references/
- `references\signals-and-verification.md`
  Routing/failure/success patterns and decision logic for codex-cli-first operations with cron exceptions.
- `references\quick-commands.md`
  Fast command set for daily codex-cli routing, cron exception hardening, and failover operations.
