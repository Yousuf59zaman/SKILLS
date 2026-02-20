# OpenClaw Codex Multi-Account Troubleshooting

## 1) `/models` shows one `openai-codex` button only

Status: expected behavior.

Reason: `/models` is provider/model picker UI, not per-auth-profile UI.
Use profile selection with:

```text
/model openai-codex/gpt-5.2-codex@openai-codex:mailA
```

## 2) `openclaw models auth login --provider openai-codex` fails with "Unknown provider"

Some builds only expose plugin auth providers for that command.
Use onboarding OAuth instead:

```powershell
openclaw onboard --flow quickstart --auth-choice openai-codex --accept-risk --skip-channels --skip-skills --skip-ui --skip-daemon --skip-health
```

## 3) Rate limit on primary account but no fallback happened

Check:

```powershell
openclaw models auth order get --provider openai-codex --json
openclaw models status --json
```

Fix:

```powershell
openclaw models auth order set --provider openai-codex openai-codex:mailA openai-codex:mailB
```

Then reset session:

```text
/new
/model openai-codex/gpt-5.2-codex
```

## 4) Manual pinning sticks to one account

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

## 5) Hooks were enabled accidentally during onboarding

Disable:

```powershell
openclaw hooks disable boot-md
openclaw hooks disable bootstrap-extra-files
openclaw hooks disable command-logger
```

## 6) Sensitive token exposure in logs/screenshots

Rotate gateway token:

```powershell
openclaw doctor --generate-gateway-token
```

Also avoid sharing raw files:

- `%USERPROFILE%\.openclaw\openclaw.json`
- `%USERPROFILE%\.openclaw\agents\main\agent\auth-profiles.json`
