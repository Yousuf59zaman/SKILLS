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

This flow was verified on this Windows machine on `2026-02-20` and `2026-02-24` with:

- OAuth profiles managed from `%USERPROFILE%\.openclaw\agents\main\agent\auth-profiles.json`
- targeted replacement flow (`mailA` replaced while `mailB` kept intact)
- explicit order control via `openclaw models auth order set`
- `/models` confirmed as provider/model picker (not per-account picker)
- `/model <provider/model>@<profileId>` confirmed for manual account pinning

## Files This Skill Maintains

- `%USERPROFILE%\.openclaw\agents\main\agent\auth-profiles.json`
  - actual OAuth credentials, profile order, cooldown state
- `%USERPROFILE%\.openclaw\openclaw.json`
  - metadata in `auth.profiles` (routing metadata, no tokens)

## Naming Standard

- Permanent lettered IDs:
  - `openai-codex:mailA` ... `openai-codex:mailZ`
- Reserved locked-tail ID:
  - `openai-codex:mail-usuf`
- Temporary latest-login profile:
  - `openai-codex:default`

Rules:

- `openai-codex:default` is temporary only and should be consumed into a permanent target after each login.
- `openai-codex:mail-usuf` is treated as immutable and must remain unchanged unless the user explicitly asks to replace/sign in for `mail-usuf`.
- Failover order must be alphabetical for existing lettered mail profiles (`mailA`, `mailB`, `mailC`, ...), then `mail-usuf` last when present.

## Important Operating Rules

- Run all auth/profile writes in one interactive PowerShell window.
- Do not run parallel profile-edit commands while onboarding is in progress.
- OAuth onboarding is interactive (`TTY` required on many builds).
- Always verify state before and after changes.

## Preflight

Run before any mutation:

```powershell
openclaw models status --json
openclaw models auth order get --provider openai-codex --json
openclaw channels list --json
```

Confirm:

- provider `openai-codex` exists
- profile IDs currently present are known
- current order is visible

## Command Building Blocks

### 1) One-time login + placement (recommended)

Use this first for any target (`mailA..mailZ` or `mail-usuf`). It runs OAuth once and places the account in one flow.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\login-once-and-place-target.ps1 -TargetProfileId openai-codex:mailD
```

Why this is preferred:

- avoids the previous two-step race where `default` sometimes was not visible immediately
- if `default` is missing post-login, it falls back to a profile-delta detection strategy
- restores unchanged profiles from pre-login baseline before writing the target placement

### 2) Interactive OAuth login only (legacy manual split flow)

```powershell
openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
```

### 3) Promote fresh `default` login into a target profile (`mailA..mailZ` or `mail-usuf`)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\promote-default-to-target.ps1 -TargetProfileId openai-codex:mailC
```

### 4) Rebuild failover order as `mailA..mailZ` + locked `mail-usuf` tail

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-codex-order-alpha-with-usuf-tail.ps1
```

### 5) Verify

```powershell
openclaw models auth order get --provider openai-codex --json
openclaw models status --json
```

## Repeatable Runbook: Replace `mailA` With New Login, Keep `mailB`

Use this for the simple two-profile rotation.

Recommended helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\replace-mailA-with-new-login.ps1
```

Expected after completion:

- order exactly: `openai-codex:mailA`, `openai-codex:mailB`
- OAuth profiles include `openai-codex:mailA` and `openai-codex:mailB`
- no active `openai-codex:default` unless intentionally kept

## Multi-Signin Protocol (Variable N, User-Defined Target Sequence)

Use this when the user says things like:

- "I want to sign in 4 times"
- "Place 1st login into mailC, 2nd into mailA, 3rd into mailB, 4th into mailD"
- "Keep `mail-usuf` unchanged and always last"

### Assistant Execution Contract (Strict)

1. Intake and normalize the plan before starting:
   - collect exact target sequence in step order (example: `mailC, mailA, mailB, mailD`)
   - map each to profile IDs (`openai-codex:mailC`, etc.)
   - allowed targets are `mailA..mailZ` and `mail-usuf`
2. If sequence length does not match requested signin count, stop and ask for correction.
3. Unless explicitly targeted in the sequence, treat `openai-codex:mail-usuf` as immutable.
4. For each step `i` in sequence (do not skip/reorder):
   - run one-shot flow for that step target:
     `powershell -ExecutionPolicy Bypass -File scripts\login-once-and-place-target.ps1 -TargetProfileId openai-codex:<target>`
   - wait for script completion confirmation in the same terminal window
   - verify order + profile presence
5. After the final step, run full verification and report final order.

### Ordering Guarantee

Final order rule is always:

- existing `openai-codex:mailA..mailZ` in alphabetical order
- then `openai-codex:mail-usuf` last (if present)

Example outcomes:

- profiles present: `mailA, mailC, mailB, mail-usuf` -> order becomes `mailA -> mailB -> mailC -> mail-usuf`
- profiles present: `mailD, mailA` -> order becomes `mailA -> mailD`

## Chat Usage Rules

Use automatic failover mode (recommended):

```text
/new
/model openai-codex/gpt-5.2-codex
```

Force one account for a session:

```text
/model openai-codex/gpt-5.2-codex@openai-codex:mailA
/model openai-codex/gpt-5.2-codex@openai-codex:mailB
/model openai-codex/gpt-5.2-codex@openai-codex:mail-usuf
```

Return to automatic routing:

```text
/new
/model openai-codex/gpt-5.2-codex
```

Note:

- `/models` lists providers/models, not one button per OAuth profile.

## Troubleshooting

- Error: `OAuth requires interactive mode.`
  - run onboarding in a real interactive PowerShell window.
- Error: `Expected source profile not found: openai-codex:default`
  - onboarding did not complete or wrong provider selected; repeat login step.
- Error: `Auth profile "<id>" not found` when using `/model ...@<id>`
  - verify exact profile IDs from `openclaw models status --json`.
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
- `scripts\login-once-and-place-target.ps1`
  - recommended one-shot flow: single OAuth sign-in, robust source detection, target placement, and order enforcement
- `scripts\replace-mailA-with-new-login.ps1`
  - one-shot helper for "replace `mailA`, keep `mailB`"
- `scripts\promote-default-to-target.ps1`
  - promote latest OAuth login (`default`) into any target profile; safe overwrite; remove temporary source
- `scripts\set-codex-order-alpha-with-usuf-tail.ps1`
  - enforce alphabetical `mailA..mailZ` failover and append `mail-usuf` last if present
- `scripts\show-codex-failover-status.ps1`
  - safe status summary (no token output)

### references/

- `references\troubleshooting.md`
  - quick diagnosis matrix + recovery commands
- `references\quick-commands.md`
  - compact command cheat-sheet for daily operation
