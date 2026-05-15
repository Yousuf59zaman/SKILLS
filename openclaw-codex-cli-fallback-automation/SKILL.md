---
name: openclaw-codex-cli-fallback-automation
description: "Keep OpenClaw automations running when browser-tool execution fails by switching to Codex CLI execution and validating delivery. Use when logs contain \"browser failed: Can't reach the OpenClaw browser control service\", \"Do NOT retry the browser tool\", cron announce delivery failures, or Codex resume errors like \"unexpected argument ... found\"."
---

# OpenClaw Codex CLI Fallback Automation

## Overview

Recover chat/cron automations during browser-control-service outages without pausing the workflow.
Detect outage signals, run Codex CLI in argument-safe mode, and verify that delivery resumes.

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

2. Detect failover window from logs:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\show-codex-cli-fallback-status.ps1
```
Use this report to confirm:
- browser service failure exists
- codex-cli exec attempts exist
- delivery success (`sendMessage ok`) exists after codex-cli execution

3. Execute Codex CLI fallback with prompt-safe stdin passing:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\invoke-codex-exec-resume-safe.ps1 `
  -Last `
  -Prompt "Automation task: summarize outage and continue workflow." `
  -Model "gpt-5.3-codex"
```

4. Verify post-run delivery:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\show-codex-cli-fallback-status.ps1 -Recent 30
```
Expect a sequence of:
- `BrowserServiceFail`
- `CliExecCodex`
- `ChannelDeliveryOk`

5. Handle recurring failures:
- If browser remains unavailable, use `$openclaw-browser-blocker-recovery`.
- If codex-cli auth/profile routing issues appear, use `$openclaw-codex-multi-account-failover`.
- If `unexpected argument` appears again, do not pass multi-word prompts as raw positional CLI args; keep stdin mode.

## Key Rule

Always pass resume prompts through stdin (`-`) when automating `codex exec resume`.
This avoids tokenization bugs where prompt words are interpreted as extra positional arguments.

## Resources

### scripts/
- `scripts\show-codex-cli-fallback-status.ps1`
  Parse OpenClaw logs and classify failover windows and outcomes.
- `scripts\invoke-codex-exec-resume-safe.ps1`
  Invoke `codex exec resume` in safe stdin mode.
- `scripts\set-openclaw-codex-default-model.ps1`
  Enforce and verify `codex-cli/gpt-5.3-codex` as the OpenClaw default model.

### references/
- `references\signals-and-verification.md`
  Failure/success patterns and decision logic for this failover.
- `references\quick-commands.md`
  Fast command set for daily operation.
