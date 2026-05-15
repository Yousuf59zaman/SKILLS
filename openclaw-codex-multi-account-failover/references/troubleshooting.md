# OpenClaw Codex Multi-Account Troubleshooting

## 1) `/models` shows one `openai-codex` button only

Status: expected behavior.

Reason: `/models` is provider/model picker UI, not per-auth-profile UI.
Use profile selection with:

```text
/model openai-codex/gpt-5.2-codex@openai-codex:mailA
```

## 2) `openclaw models auth login --provider openai-codex` fails with provider errors

Some builds only expose plugin auth providers for that command.
Use onboarding OAuth instead:

```powershell
openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
```

## 3) OAuth onboarding says `OAuth requires interactive mode`

Use a normal interactive PowerShell window (TTY required).

## 4) Promotion fails with `Source profile not found: openai-codex:default`

The login step did not complete or did not authenticate `openai-codex`.
Repeat onboarding, complete browser auth, then rerun:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\promote-default-to-target.ps1 -TargetProfileId openai-codex:mailB
```

Preferred fix (avoids split-flow race):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\login-once-and-place-target.ps1 -TargetProfileId openai-codex:mailB
```

## 5) I had to sign in twice before placement worked

Use the one-shot helper instead of manual login + promote steps:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\login-once-and-place-target.ps1 -TargetProfileId openai-codex:mailD
```

Reason: this helper handles both outcomes after OAuth:

- normal case: `openai-codex:default` exists and is promoted
- fallback case: `default` missing, but a provider profile delta is detected and placed safely

## 6) Rate limit on primary account but no fallback happened

Check:

```powershell
openclaw models auth order get --provider openai-codex --json
openclaw models status --json
```

Fix with alphabetical + locked-tail order:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-codex-order-alpha-with-usuf-tail.ps1
```

Then reset session:

```text
/new
/model openai-codex/gpt-5.2-codex
```

## 7) Manual pinning sticks to one account

If you used:

```text
/model ...@openai-codex:mailA
```

That session is pinned to `mailA`.

Return to auto mode:

```text
/new
/model openai-codex/gpt-5.2-codex
```

## 8) `mail-usuf` moved from the last position

Rebuild order:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-codex-order-alpha-with-usuf-tail.ps1
```

## 9) Hooks were enabled accidentally during onboarding

Disable:

```powershell
openclaw hooks disable boot-md
openclaw hooks disable bootstrap-extra-files
openclaw hooks disable command-logger
```

## 10) Sensitive token exposure in logs/screenshots

Rotate gateway token:

```powershell
openclaw doctor --generate-gateway-token
```

Also avoid sharing raw files:

- `%USERPROFILE%\.openclaw\openclaw.json`
- `%USERPROFILE%\.openclaw\agents\main\agent\auth-profiles.json`
