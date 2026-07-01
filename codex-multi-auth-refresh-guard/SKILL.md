---
name: codex-multi-auth-refresh-guard
description: Reapply and verify the codex-multi-auth refresh-token drift fix. Use when Codex/codex-multi-auth shows "refresh token has already been used", when switching accounts may overwrite a freshly rotated auth.json with stale tokens, after updating or reinstalling codex-multi-auth, or when the active C:\Users\This pc\.codex\auth.json must be imported into C:\Users\This pc\.codex\multi-auth\openai-codex-accounts.json before account switching or Codex app startup.
---

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

Default apply and verify:

```powershell
node "C:\Users\This pc\.codex\skills\codex-multi-auth-refresh-guard\scripts\apply-refresh-guard.mjs" --verify-temp
```

Use explicit paths when needed:

```powershell
node "C:\Users\This pc\.codex\skills\codex-multi-auth-refresh-guard\scripts\apply-refresh-guard.mjs" --package-root "C:\Users\This pc\AppData\Roaming\npm\node_modules\codex-multi-auth" --codex-home "C:\Users\This pc\.codex" --verify-temp
```

Check without editing:

```powershell
node "C:\Users\This pc\.codex\skills\codex-multi-auth-refresh-guard\scripts\apply-refresh-guard.mjs" --check-only
```

## Expected Fix

The patched flow must import the current active Codex auth snapshot into the matching stored account before:

- `codex-multi-auth switch <n>` persists and syncs the selected account.
- Codex app startup routing runs `autoSyncActiveAccountToCodex()`.
- Dashboard/menu drift sync writes the active account to Codex state.

The matching account should be found by account id, email, or current refresh token, allowing unique account-id fallback without email when the package supports that behavior.
