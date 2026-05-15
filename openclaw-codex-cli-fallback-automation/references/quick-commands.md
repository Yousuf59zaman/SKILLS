# Quick Commands

## 1) Health and Routing

```powershell
openclaw models status --json
openclaw gateway status --json
openclaw browser status --json
```

## 2) Enforce Codex CLI as Default Model

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-openclaw-codex-default-model.ps1
```

## 3) Analyze Latest Failover Window

```powershell
powershell -ExecutionPolicy Bypass -File scripts\show-codex-cli-fallback-status.ps1 -Recent 30
```

## 4) Run Codex Resume in Prompt-Safe Mode

```powershell
powershell -ExecutionPolicy Bypass -File scripts\invoke-codex-exec-resume-safe.ps1 `
  -Last `
  -Model "gpt-5.3-codex" `
  -Prompt "Automation: continue task and send final channel update."
```

## 5) Use Explicit Session Instead of `--last`

```powershell
powershell -ExecutionPolicy Bypass -File scripts\invoke-codex-exec-resume-safe.ps1 `
  -SessionId "your-session-id" `
  -Model "gpt-5.3-codex" `
  -Prompt "Continue previous run."
```

## 6) Manual One-Liner Without Wrapper

```powershell
@'
Automation task with multi-word prompt.
'@ | codex exec resume --last -m gpt-5.3-codex --skip-git-repo-check -
```
