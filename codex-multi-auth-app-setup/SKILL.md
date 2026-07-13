---
name: codex-multi-auth-app-setup
description: Install and verify the codex-multi-auth 2.6.0 capture-back fix plus the new-ChatGPT-desktop-app launcher so account switching survives refresh-token rotation and the app re-reads ~/.codex/auth.json after a switch. Use when Yousuf wants to reproduce this working state on another machine (e.g. office laptop), after a fresh `npm i -g codex-multi-auth@latest`, after `codex app` says "Codex Desktop not found" for the Store/MSIX ChatGPT app, or when `Get-Process Codex,codex` failed to actually stop the desktop app.
---

# Codex Multi Auth + ChatGPT Desktop App Setup

Reproduces the working multi-auth + desktop-app state from the dev laptop onto
another machine (office laptop). It does three things, all idempotent, and then
verifies with an isolated test — no live tokens are touched or printed.

1. **Capture-back patch** for `codex-multi-auth` 2.6.0. The 2.6.0 `switch`
   command dropped the pre-switch read of live `~/.codex/auth.json`, so a
   refresh-token rotation done by the ChatGPT desktop app was lost on the next
   switch. This re-adds `captureCodexCliAuthIntoStorage()` into
   `dist/lib/codex-manager/persist-selected-account.js` so the *outgoing*
   account's rotated refresh token is written back to the store before auth.json
   is overwritten.
2. **`codex-app` launcher** (`codex-app.ps1` + `codex-app.cmd`) on PATH. `codex
   app` (the `@openai/codex` CLI, even 0.144.1) only detects the non-Store
   "Codex" installer; the new ChatGPT desktop app is the Microsoft Store MSIX
   package `OpenAI.Codex` (`ChatGPT.exe`), invisible to that detector. The
   launcher starts it by AppUserModelID and stops `ChatGPT.exe` + `codex.exe`
   (never `ChatGPT Classic.exe`).
3. **Versions** — ensures `codex-multi-auth` is ≥ 2.6.0. (`@openai/codex` is
   upgraded only with `--upgrade-codex`, since the app itself is the MSIX
   package and the CLI version is secondary.)

## Workflow

1. Locate the installed `codex-multi-auth` package, the Codex home, and the
   user `bin` dir on PATH. Report versions and planned actions.
2. Back up any file before editing.
3. Apply the capture-back patch (idempotent — skips if already present).
4. Install the `codex-app` launcher to the user bin dir (idempotent).
5. Verify: `node --check`, an import test that `captureCodexCliAuthIntoStorage`
   is exported, and an **isolated capture-back test** that writes a fake rotated
   refresh token to a temp `auth.json` (via `CODEX_CLI_AUTH_PATH`) and asserts
   the patched function moves it into a temp store — the real `auth.json` and
   real store are never read or written.
6. Resolve and report the new ChatGPT desktop app's AppUserModelID
   (`OpenAI.Codex_<pub>!App`) via `Get-AppxPackage`.
7. Never print access/refresh/id tokens. Report only versions, paths, booleans,
   and PASS/FAIL.

## Commands

Dry-run (report only, no writes):

```powershell
node "$env:USERPROFILE\.codex\skills\codex-multi-auth-app-setup\scripts\apply-setup.mjs" --check
```

Apply everything (patch + launcher + verify):

```powershell
node "$env:USERPROFILE\.codex\skills\codex-multi-auth-app-setup\scripts\apply-setup.mjs" --apply
```

Also upgrade `codex-multi-auth` and `@openai/codex` to latest before patching:

```powershell
node "$env:USERPROFILE\.codex\skills\codex-multi-auth-app-setup\scripts\apply-setup.mjs" --apply --upgrade --upgrade-codex
```

Explicit paths (non-default package root / Codex home / bin dir):

```powershell
node "$env:USERPROFILE\.codex\skills\codex-multi-auth-app-setup\scripts\apply-setup.mjs" --apply `
  --package-root "C:\Users\you\AppData\Roaming\npm\node_modules\codex-multi-auth" `
  --codex-home "C:\Users\you\.codex" `
  --bin-dir "C:\Users\you\bin"
```

Isolated capture-back test only (does not patch; just proves the patched capture
function works against a temp auth.json):

```powershell
node "$env:USERPROFILE\.codex\skills\codex-multi-auth-app-setup\scripts\verify-capture-back.mjs"
```

## What the patched switch flow should do

After applying, the full account-switch cycle on the new ChatGPT desktop app is:

```powershell
codex-multi-auth switch 2   # capture account 1's live rotated token, activate account 2
codex-app                   # restart the new ChatGPT desktop app so it loads account 2
```

`codex-app` stops only `ChatGPT.exe` + `codex.exe` and relaunches the new app by
AUMID. The app re-reads `~/.codex/auth.json` (its auth source) on startup.

## Safety rules

- Dry-run by default; never write without `--apply`.
- Always back up a file before overwriting it.
- Never print tokens; verify with a temp auth.json only.
- Do not stop or launch `ChatGPT Classic` (the older `OpenAI.ChatGPT-Desktop`
  app) — this skill is only for the new ChatGPT desktop app (`OpenAI.Codex`).
- If the `codex-multi-auth` package layout differs from the expected 2.6.0
  modular file (`dist/lib/codex-manager/persist-selected-account.js`) and the
  patch anchors are not found, abort cleanly without writing and tell Yousuf to
  reinstall `codex-multi-auth@latest` or patch manually.
- The patch lives in `node_modules`; any future `npm install -g
  codex-multi-auth@latest` overwrites it. Re-run this skill's `--apply`
  (idempotent) to restore it.