# Quick Commands

## 1) Health and Routing Snapshot

```powershell
openclaw models status --json
openclaw gateway status --json
openclaw browser status --json
```

## 2) Enforce Codex CLI as Default Model

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-openclaw-codex-default-model.ps1
```

## 3) Verify Alias and Switch Policy

```powershell
openclaw models status --json
```

Expected checks from output:
- `resolvedDefault` is `codex-cli/gpt-5.3-codex`
- alias `codex` points to `codex-cli/gpt-5.3-codex`
- aliases `g3` and `g3-flash` exist for explicit-only user switches

## 4) Apply Config Changes Immediately

```powershell
openclaw gateway restart
```

## 5) Analyze Latest Failover Window

```powershell
powershell -ExecutionPolicy Bypass -File scripts\show-codex-cli-fallback-status.ps1 -Recent 30
```

## 6) Run Codex Resume in Prompt-Safe Mode

```powershell
powershell -ExecutionPolicy Bypass -File scripts\invoke-codex-exec-resume-safe.ps1 `
  -Last `
  -Model "gpt-5.3-codex" `
  -Prompt "Automation: continue task and send final channel update."
```

## 7) Use Explicit Session Instead of `--last`

```powershell
powershell -ExecutionPolicy Bypass -File scripts\invoke-codex-exec-resume-safe.ps1 `
  -SessionId "your-session-id" `
  -Model "gpt-5.3-codex" `
  -Prompt "Continue previous run."
```

## 8) Manual One-Liner Without Wrapper

```powershell
$prompt = "Automation task with multi-word prompt."
$prompt | codex exec resume --last -m gpt-5.3-codex --skip-git-repo-check -
```

## 9) Explicit Temporary Switch (Only When User Asks)

```powershell
openclaw models set google-gemini-cli/gemini-3-flash-preview
```

Revert to codex-cli default:

```powershell
openclaw models set codex-cli/gpt-5.3-codex
```

## 10) Apply Cron Exception Hardening (Recommended)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\apply-openclaw-cron-exception-hardening.ps1
```

Optional (also disable start-notice announce delivery):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\apply-openclaw-cron-exception-hardening.ps1 `
  -DisableStartNoticeDelivery
```
