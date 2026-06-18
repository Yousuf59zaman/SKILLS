---
name: openclaw-codex
description: Sync or convert OpenClaw openai-codex auth profiles into codex-multi-auth storage using Codex multi-auth's required account format while deliberately replacing real refresh tokens with inert fake placeholders. Also reconcile OpenClaw auth order so it contains only profiles that exist in auth-profiles.json and automatically appends newly added profiles to the matching provider order. Use when the user asks for openclaw-codex, wants OpenClaw Codex profiles copied/imported/synced into Codex multi-auth, wants access-token-only Codex multi-auth profiles, wants auth order cleaned/synced with auth profiles, or says not to use/copy real refresh tokens in codex-multi-auth.
---

# OpenClaw Codex → Codex Multi-Auth Sync

## Core rules

Never copy real OpenClaw refresh tokens into Codex multi-auth storage.

OpenClaw stays the source of truth for real refresh tokens. Codex multi-auth receives only:

- `accessToken`
- `expiresAt`
- account identity/email metadata
- a deterministic inert `refreshToken` placeholder (`access_only_placeholder_*`), because codex-multi-auth currently requires a non-empty `refreshToken` field and may drop accounts if the field is missing/blank.

Always reconcile OpenClaw auth order as part of this skill:

- keep only order entries that exist in that agent's `auth-profiles.json`
- drop stale/deleted/duplicate order entries
- append newly added profiles from `auth-profiles.json` to the matching provider order
- keep `lastGood` from pointing at deleted profiles

Do not edit `~/.codex/auth.json` unless the user explicitly asks. That file can contain Codex CLI/Desktop's own independent token and is separate from this OpenClaw-shared-token workflow.

## Standard workflow

1. Use the bundled script:

   ```bash
   node skills/openclaw-codex/scripts/sync-openclaw-to-codex-multiauth-access-only.mjs
   ```

   This is a dry run. Check:
   - `authOrder` changes: stale order removals and newly appended profile IDs
   - `codexMultiAuth.sourceCodexProfiles`, `nextAccounts`, and `accessTokens`
   - `codexMultiAuth.realRefreshLikeCount` must be `0`

2. Apply the sync only when the user asked to perform the conversion/sync:

   ```bash
   node skills/openclaw-codex/scripts/sync-openclaw-to-codex-multiauth-access-only.mjs --apply
   ```

3. Verify after apply:

   ```bash
   codex-multi-auth list
   node -e "const fs=require('fs');const p=process.env.USERPROFILE+'/.codex/multi-auth/openai-codex-accounts.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));const a=j.accounts||[];console.log(JSON.stringify({accounts:a.length,access:a.filter(x=>x.accessToken).length,placeholders:a.filter(x=>String(x.refreshToken||'').startsWith('access_only_placeholder_')).length,realRefresh:a.filter(x=>x.refreshToken&&!String(x.refreshToken).startsWith('access_only_placeholder_')).length,active:j.activeIndex,activeEmail:a[j.activeIndex]?.email},null,2));"
   ```

4. Report concise results: auth-order additions/removals, Codex multi-auth account count, access-token count, placeholder count, real refresh-token count, backup path, and whether `codex-multi-auth list` stayed healthy.

## Defaults

The script defaults to:

- OpenClaw root: `%USERPROFILE%/.openclaw`
- Agents whose auth order is reconciled: `main,openclaw`
- Source: `%USERPROFILE%/.openclaw/agents/main/agent/auth-profiles.json`
- Target: `%USERPROFILE%/.codex/multi-auth/openai-codex-accounts.json`
- Backup base: `%USERPROFILE%/.openclaw/workspace/backups`

Optional overrides:

```bash
node skills/openclaw-codex/scripts/sync-openclaw-to-codex-multiauth-access-only.mjs --openclaw-root <dir> --agents main,openclaw --source <path> --target <path> --backup-base <dir> --apply
```

## Safety notes

- The auth-order reconciler applies per provider, not only OpenAI Codex; if a provider has profiles in `auth-profiles.json`, the provider's order is made to match those profile IDs.
- The Codex multi-auth converter only imports OpenClaw profiles where `provider === "openai-codex"` and an access token exists.
- It preserves useful existing Codex multi-auth metadata when matching by email/account ID, including rate-limit state, last-used timestamps, enabled state, and active index where possible.
- It creates backups before every `--apply` write to OpenClaw auth-state files and Codex multi-auth JSON.
- If access tokens expire before the next sync, Codex multi-auth may fail to refresh because the placeholder is not a real refresh token. That is expected. Re-sync from OpenClaw to copy fresh access tokens.
- If codex-multi-auth or OpenClaw auth-state schema changes later, inspect the current schema before changing placeholder or auth-order behavior.
