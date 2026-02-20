---
name: openclaw-codex-multi-account-failover
description: Manage multiple OpenAI Codex OAuth accounts in OpenClaw with stable profile IDs, ordered automatic failover, and session-level profile selection. Use when adding a second/third ChatGPT mail account, rotating accounts after quota/rate-limit errors, repairing auth profile order, or explaining why /models does not show one button per account.
---

# OpenClaw Codex Multi-Account Failover

## Overview

Set up and maintain a reliable OpenClaw account-routing system where:

- multiple OpenAI Codex OAuth accounts coexist in one agent
- failover order is explicit and predictable
- chat commands can force one account when needed
- normal mode uses automatic failover when one account is rate-limited

## Verified Success on This Machine

This flow was already verified on this Windows machine on `2026-02-20` with:

- `openai-codex:mailA` and `openai-codex:default` both present and valid
- order override set to `mailA -> default`
- `/models` confirmed as provider/model picker (not per-account picker)
- `/model <provider/model>@<profileId>` confirmed for manual account pinning

## Files This Skill Maintains

- `%USERPROFILE%\.openclaw\agents\main\agent\auth-profiles.json`
  - actual OAuth credentials, profile order, cooldown state
- `%USERPROFILE%\.openclaw\openclaw.json`
  - metadata in `auth.profiles` (routing metadata, no tokens)

## Naming Standard

- Keep permanent IDs per mail/account:
  - `openai-codex:mailA`
  - `openai-codex:mailB`
  - `openai-codex:mailC`
- Treat `openai-codex:default` as latest-login temporary profile unless intentionally kept in order.

## Workflow (Do In Order)

### 1) Preflight

Run:

```powershell
openclaw models status --json
openclaw models auth order get --provider openai-codex --json
openclaw channels list --json
```

Confirm:

- provider `openai-codex` exists
- OAuth profile count is what you expect
- existing order is visible before changes

### 2) Preserve Current Default Profile (Before New Login)

If `openai-codex:default` currently represents an account you want to keep, copy it to a permanent ID first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\add-codex-profile.ps1 `
  -NewProfileId openai-codex:mailB `
  -SourceProfileId openai-codex:default `
  -OrderAction append
```

Skip this if that permanent profile already exists and is valid.

### 3) Login New Account (OAuth)

On some OpenClaw builds, `openclaw models auth login --provider openai-codex` is unavailable.
Use onboarding for OAuth:

```powershell
openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
```

Complete browser OAuth with the new mail account.

If prompted for hooks, choose "Skip for now" unless explicitly needed.

### 4) Save New Login to Permanent Profile ID

After onboarding login, the new account is usually in `openai-codex:default`.
Copy it to a permanent ID:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\add-codex-profile.ps1 `
  -NewProfileId openai-codex:mailC `
  -SourceProfileId openai-codex:default `
  -OrderAction append
```

### 5) Set Explicit Failover Priority

Preferred explicit order example:

```powershell
openclaw models auth order set --provider openai-codex `
  openai-codex:mailA `
  openai-codex:mailB `
  openai-codex:mailC
```

If you intentionally want `default` as backup:

```powershell
openclaw models auth order set --provider openai-codex `
  openai-codex:mailA `
  openai-codex:mailB `
  openai-codex:mailC `
  openai-codex:default
```

### 6) Verify Final State

Run:

```powershell
openclaw models auth order get --provider openai-codex --json
openclaw models status --json
```

Expected:

- `providersWithOAuth` shows `openai-codex (N)`
- order list matches your intended priority
- all chosen profile IDs appear under OAuth status

### 7) Chat Usage Rules

Use automatic failover mode (recommended):

```text
/new
/model openai-codex/gpt-5.2-codex
```

Force one account for a session:

```text
/model openai-codex/gpt-5.2-codex@openai-codex:mailA
/model openai-codex/gpt-5.2-codex@openai-codex:mailB
```

Return to automatic routing:

```text
/new
/model openai-codex/gpt-5.2-codex
```

Note:

- `/models` lists providers/models, not one button per OAuth profile.

## Troubleshooting

- Error: `Unknown provider "openai-codex"` during `models auth login`
  - Use onboarding OAuth command from Step 3.
- Error: `Auth profile "<id>" not found` when using `/model ...@<id>`
  - verify exact profile ID from `openclaw models status --json`.
- Behavior: `/models` shows only one `openai-codex` provider button
  - expected behavior; select account via `/model ...@openai-codex:<profile>`.
- Hooks enabled by mistake:

```powershell
openclaw hooks disable boot-md
openclaw hooks disable bootstrap-extra-files
openclaw hooks disable command-logger
```

## Security Notes

- Never share raw `auth-profiles.json` or `openclaw.json` publicly.
- If gateway token was exposed in screenshots/chat, rotate it:

```powershell
openclaw doctor --generate-gateway-token
```

## Resources

### scripts/

- `scripts\add-codex-profile.ps1`
  - copy one profile to a new permanent ID, optional order update, auto-backup
- `scripts\show-codex-failover-status.ps1`
  - safe status summary (no token output)

### references/

- `references\troubleshooting.md`
  - quick diagnosis matrix + recovery commands
- `references\quick-commands.md`
  - compact command cheat-sheet for daily operation
