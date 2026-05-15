# Quick Commands

## Core status

```powershell
openclaw models status --json
openclaw models auth order get --provider openai-codex --json
openclaw channels list --json
```

## Recommended: one sign-in + direct placement (single step)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\login-once-and-place-target.ps1 -TargetProfileId openai-codex:mailD
```

## Interactive OAuth login (new account to temporary default)

```powershell
openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
```

## Promote fresh login to a target profile

```powershell
powershell -ExecutionPolicy Bypass -File scripts\promote-default-to-target.ps1 -TargetProfileId openai-codex:mailB
```

## Enforce alphabetical failover + locked `mail-usuf` tail

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-codex-order-alpha-with-usuf-tail.ps1
```

## One-shot legacy flow: replace `mailA`, keep `mailB`

```powershell
powershell -ExecutionPolicy Bypass -File scripts\replace-mailA-with-new-login.ps1
```

## Explicit manual order examples

```powershell
openclaw models auth order set --provider openai-codex openai-codex:mailA openai-codex:mailB openai-codex:mailC openai-codex:mail-usuf
```

## Chat commands

```text
/new
/model openai-codex/gpt-5.2-codex
/model openai-codex/gpt-5.2-codex@openai-codex:mailA
/model openai-codex/gpt-5.2-codex@openai-codex:mail-usuf
/model status
```
