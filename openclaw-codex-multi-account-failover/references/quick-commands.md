# Quick Commands

## Core status

```powershell
openclaw models status --json
openclaw models auth order get --provider openai-codex --json
openclaw channels list --json
```

## Set explicit failover order

```powershell
openclaw models auth order set --provider openai-codex openai-codex:mailA openai-codex:mailB
```

## Add permanent profile from current default

```powershell
powershell -ExecutionPolicy Bypass -File scripts\add-codex-profile.ps1 -NewProfileId openai-codex:mailB -SourceProfileId openai-codex:default -OrderAction append
```

## OAuth login path (if models auth login is unavailable)

```powershell
openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
```

## Chat commands

```text
/new
/model openai-codex/gpt-5.2-codex
/model openai-codex/gpt-5.2-codex@openai-codex:mailA
/model status
```
