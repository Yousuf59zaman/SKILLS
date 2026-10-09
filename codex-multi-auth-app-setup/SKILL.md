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

If `%USERPROFILE%\.paseo\codex-shared-bridge\routing-enabled.json` exists, preserve the installed shared-mode launcher. The setup script now skips replacing that launcher with the standalone template. Use `codex-paseo-sync` for shared backend/account-reload repair; its launcher takes `codex-app <account number>` by manual force by default (bounded interrupt, no replay; `-WaitSeconds S` opts into the guarded idle wait). Do not apply the broad process-name shutdown described in the older standalone template to a shared installation.

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
codex-app switch 2          # one-step manual force: stop old runtime, switch, boot on account 2
codex-app                   # restart the new ChatGPT desktop app so it loads account 2
```

On the SHARED backend (routing-enabled.json present) NEVER run a bare
`codex-multi-auth switch N` — it rewrites `~/.codex/auth.json` while the
running native/Desktop keep the OLD account, with no stop, no boot, and
no reconnect. Always use the one-step `codex-app switch N` (or
`codex-app` after, never the bare switch alone). A bare
`codex-multi-auth switch N` is STANDALONE-mode only (no shared routing),
where the app relaunch picks the new auth up directly.

`codex-app` stops only `ChatGPT.exe` + `codex.exe` and relaunches the new app by
AUMID. The app re-reads `~/.codex/auth.json` (its auth source) on startup.

## Paseo shared-backend mode (routing-enabled.json present)

On the dev laptop the launcher is shared-mode aware: when
`~/.paseo/codex-shared-bridge/routing-enabled.json` exists, `codex-app` instead
drives the shared bridge by MANUAL FORCE by default (user-authorized):
bounded turn/interrupt of running replies (never replayed) over the
authenticated gateway check channel against natively loaded threads within
one ~10s total budget, scoped Desktop shutdown, owned backend stop,
optional account switch, backend reboot, and reconnect
(`Ensure-Backend.ps1 -RecoverFailed` → `interrupt-shared-turns.mjs` →
Desktop family stop → `Backend-Control.ps1 -ForceManual` →
`codex-multi-auth switch N` → `Ensure-Backend.ps1` →
`Open-Shared-Apps.ps1`). `codex-app switch N` (or legacy `codex-app N` /
`codex-app -Account N`) stops the old runtime first, then switches, then
boots on the new auth; Force opening also recovers a known failed owned
backend (an intentional restart never consumes crash strikes), and a
guarded switch stops the idle backend before switching, never rebooting
on the old auth. `codex-app -NoStop` only opens/ensures.
`-WaitSeconds S` explicitly opts into the old guarded idle wait instead of
forcing (bounded 0–600 seconds, rejected pre-mutation outside that range). The bundled
`scripts/codex-app.ps1` in this skill is kept in sync with `~/bin/codex-app.ps1`
— never overwrite the bin copy with an older skill copy, or shared mode breaks.
Rules for this mode:

- `codex-multi-auth switch N` only rewrites `~/.codex/auth.json`. The running
  shared native backend and Desktop keep the OLD account until `codex-app`
  force-restarts them onto the new auth.
- `Finish the shared reply before restarting Codex` now appears ONLY in
  explicitly guarded mode (`-WaitSeconds S` expiring while busy) and from
  unattended idle-only tasks (catalog/history/question), which never force.
  A MANUAL `codex-app` invocation instead interrupts running replies by
  design (bounded cancel, visible notice, no replay) and proceeds. Never
  force-kill the backend mid-turn EXCEPT through this launcher, which owns
  the exact supervisor/native/Desktop identities it stops.
- `The shared backend repeatedly failed; inspect status.json` means the
  supervisor (`service.mjs`) exhausted its restart budget. Check
  `~/.paseo/codex-shared-bridge/status.json` (`backend.state: failed`) and
  `backend-error.private.log`. The usual cause is a stale `LISTENING` socket on
  port `19457` whose owner PID no longer exists (`netstat -ano | findstr 19457`
  vs `tasklist`): `Ensure-Backend.ps1` then refuses to start a replacement
  (`A local shared port is occupied`). That ghost socket only clears with a
  Windows reboot. After reboot the `PaseoCodexSharedBackendStartup` task brings
  the backend back; then run `codex-app` to reconnect Desktop + Paseo on the
  newly switched account.
- Do NOT change the native port (`19457`) or gateway port (`19458`) to dodge a
  ghost socket — the ports are hardcoded across `service.mjs`,
  `Restart-Idle-Backend.ps1`, and the Desktop launch route.

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

## Account-switch hardening (ghost / stop-all / manual pause)

Shared-mode account work now goes through one canonical frozen-port
classifier (`Backend-PortPreflight.ps1` in the bridge — never a second
copy): every stop/switch/boot path first proves the state of frozen ports
`19457` (native) / `19458` (gateway) as `free`, `owned-live`,
`ghost-reboot-required`, `foreign-refuse`, or `unknown-refuse`.

- A stable `LISTENING` socket whose recorded owner is positively dead
  (true process-not-found proven twice) is a kernel ghost: the tools
  report exactly `ghost socket — reboot required` BEFORE any
  cancel/Desktop-stop/auth/boot mutation, and only a Windows reboot
  clears it — never a port dodge, broad kill, or Winsock/firewall change.
  Foreign listeners and unverifiable (unknown/access-denied) states
  refuse with zero mutations. No ghost is promised clearable by command.
- `codex-stop-all` (on PATH; same implementation as `codex-app
  -StopOnly`) stops ONLY the `OpenAI.Codex` MSIX Desktop family plus the
  owned shared supervisor+native, verifies BOTH frozen ports released,
  then publishes a boot-scoped manual pause (`manual-pause.private.json`,
  boot identity only, no secrets). KeepAlive/recovery/startup/Ensure
  honor it and do NOT respawn until the next manual
  `codex-app`/`-NoStop`/`switch` resumes or the next Windows boot
  autostarts. No task/job parent is ever killed — automatic boot is
  disabled purely logically.
- Sacred order is unchanged: stop OLD supervisor+native+Desktop →
  `codex-multi-auth switch N` → ONE boot of the new auth → reconnect.
  After a stop-all (both ports free), `codex-app switch N` proves
  already-stopped and goes straight to switch + single boot — it never
  Ensures/boots the OLD auth just to obtain status.
- In shared mode NEVER run a bare `codex-multi-auth switch N` alone and
  expect the runtime to follow; always follow with `codex-app` (or use
  one-step `codex-app switch N`). Standalone (non-shared) flows keep
  their existing stop-then-switch order.
- Launcher sync rule: `scripts/codex-app.ps1` in this skill must stay
  byte-identical to `~/bin/codex-app.ps1` (hash-match); the installer
  refuses to downgrade bin by the `SHARED-CANONICAL-REVISION` anchor
  (and refuses same-revision drift). Repair a stale skill copy with
  `apply-setup.mjs --apply --sync-from-bin`, never by hand-editing one
  side.
- Read-only diagnostics print PASS/FAIL, booleans, counts, and category
  labels only — never tokens, emails, ids, transcripts, or raw logs.