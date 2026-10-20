## Version gate and diagnostics

Use this retained legacy branch only for inspected 2.2.x or 2.3.x packages. It defaults to check-only; `--apply` is required for writes. Unknown/newer layouts refuse before backup or mutation. `--verify-temp --allow-auth-read` additionally requires explicit `--codex-home`: it copies selected auth data and is NOT a synthetic-only test. Never use it during a skill organization task. Prefer the synthetic fixture tests for merge validation.

# Codex Multi Auth Refresh Guard

Use this skill to keep `codex-multi-auth` from writing stale stored refresh tokens back into Codex's active `auth.json`.
The bundled script supports both the older monolithic `2.2.x` package layout and the modular `2.3.x` package layout.

## Workflow

1. Locate the installed `codex-multi-auth` package and the active Codex home.
2. Back up `auth.json`, `multi-auth/openai-codex-accounts.json`, and any package file before editing.
3. Run `scripts/apply-refresh-guard.mjs` to patch the installed package.
4. Run the temp-only simulation when possible; it copies auth/profile data to `%TEMP%`, injects dummy stale tokens into the copied account pool, runs `switch`, and checks that the copied pool is repaired from the copied `auth.json`.
5. Never print access tokens, refresh tokens, id tokens, or full auth JSON. Report only version, paths, booleans, and hashes if absolutely needed.

## Commands

Optional apply and copied-auth verification, only with explicit authorization (not the default):

```powershell
node "<this-skill>\scripts\apply-refresh-guard.mjs" --codex-home "<codex-home>" --apply --verify-temp --allow-auth-read
```

Use explicit paths when needed:

```powershell
node "<this-skill>\scripts\apply-refresh-guard.mjs" --package-root "<package-root>" --codex-home "<codex-home>" --check-only
```

Check without editing:

```powershell
node "<this-skill>\scripts\apply-refresh-guard.mjs" --check-only
```

## Expected Fix

The patched flow must import the current active Codex auth snapshot into the matching stored account before:

- `codex-multi-auth switch <n>` persists and syncs the selected account.
- Codex app startup routing runs `autoSyncActiveAccountToCodex()`.
- Dashboard/menu drift sync writes the active account to Codex state.

The matching account should be found by account id, email, or current refresh token, allowing unique account-id fallback without email when the package supports that behavior.
