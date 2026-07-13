---
name: rotate-opencode-go-auth-profiles
description: Install, audit, and test default-first OpenCode Go auth-profile rotation for OpenClaw. Use when opencode-go:default must remain primary while healthy, fallback and fallback-2 must alternate only after default fails, one request must keep one profile across model fallbacks, or main-cron must be excluded from profile overrides.
---

# Rotate OpenCode Go Auth Profiles

Rotate auth profiles without changing model routes.

## Selection Contract

1. Use `opencode-go:default` for every request while it is healthy.
2. On `429`, quota, `401/403`, provider `5xx/503`, timeout, connection error, or provider unavailable before a usable reply, block only the failed profile.
3. While default is blocked, alternate globally:
   - request A: `opencode-go:fallback`
   - request B: `opencode-go:fallback-2`
   - request C: `opencode-go:fallback`
4. Lock the selected fallback profile for all model attempts within one user request.
5. Exclude `main-cron`; apply only to `clawdbot_agent`, `openclawy_agent`, and `moltbot_agent`.

Use `Retry-After` when present. Otherwise block transient/rate-limit failures for 10 minutes and auth/key/permission failures for 30 minutes. Retry default after its block expires. If one fallback fails, use the other; if all are blocked, try the profile whose block expires soonest and surface the real provider error if all fail.

## Canonical Files

```text
C:\Users\User\.openclaw\workspace\scripts\opencode-go-profile-rotation-core.mjs
C:\Users\User\.openclaw\workspace\scripts\opencode-go-profile-rotation-guard.mjs
C:\Users\User\.openclaw\workspace\.opencode-go-profile-rotation-state.json
```

## Apply and Verify

```powershell
node --check "$env:USERPROFILE\.openclaw\workspace\scripts\opencode-go-profile-rotation-core.mjs"
node --check "$env:USERPROFILE\.openclaw\workspace\scripts\opencode-go-profile-rotation-guard.mjs"
node "$env:USERPROFILE\.openclaw\workspace\scripts\opencode-go-profile-rotation-core.mjs" --self-test
node "$env:USERPROFILE\.openclaw\workspace\scripts\opencode-go-profile-rotation-guard.mjs"
& "$env:APPDATA\npm\openclaw.cmd" config validate --json
```

After gateway restart, test healthy default, default rate-limit, auth error, block expiry, fallback failure, request-level lock, `main-cron` exclusion, and unchanged model routing. Log profile IDs only; never log keys.

## Guardrails

- Do not modify global model order or task-category fallbacks.
- Do not rotate because of poor answer quality.
- Do not expose API keys, token hashes that can be reversed, or auth file contents.
- Preserve state after genuine failures; reset synthetic test state only after recording test evidence.

