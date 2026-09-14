---
name: opencode-browser-session-guard
description: "Install, repair, or audit shared Chrome tab isolation for parallel OpenCode conversations on Windows, preserving an existing persistent login. Use for tab takeover, shared MCP state, reconnect/cancellation races, or the OpenCode shared-browser launcher; not OpenClaw routing or general browser tasks."
---

# OpenCode Browser Session Guard

Keep OpenCode conversations on one persistent Chrome profile while separating browser-tool state and tab ownership. Direct attachment to the same CDP endpoint does **not** isolate tabs, and separate MCP processes do not isolate multiple conversations sharing a single OpenCode server.

## Inspect the current setup

- For the intended Google login and its Chrome profile, read [shared login and profile setup](references/shared-login-profile.md). Load the private account/profile binding from the OpenCode config directory before choosing or repairing a profile; every OpenCode conversation must reuse that same login.
- Read only browser-related entries and the `instructions` list from the current OpenCode config. Inspect its browser launcher/settings, plugin and loopback listener. Do not dump the whole configuration, Chrome profile, private page titles/URLs, cookies, or account data.
- This bundle supports Windows, Node 24+, and an existing OpenCode shared profile on port 9222. Its installer expects existing `playwright`, `chrome-devtools`, and `chrome_devtools` MCP entries and either the previous launcher or shared-profile settings. Inspect and adapt a different layout deliberately; do not create/copy an account profile automatically.
- Preserve the current task's scope: an audit can stop after reporting findings; install/repair authorization covers the matching browser configuration changes. Syncing this skill to other agents shares knowledge, not their live browser configuration.

## Prepare a clean working copy

Run the bundled helper from any directory:

```powershell
node "<skill-dir>/scripts/prepare-runtime.mjs"
```

It copies the versioned runtime into a unique directory under the local cache and prints that directory. Run package installation, tests and the installer **there**. Never run them inside the synced skill folder: dependency trees, test profiles and generated browser files must remain local.

```powershell
Set-Location "<prepared-directory>"
npm ci --ignore-scripts --no-audit --no-fund
node install.mjs --check
```

`--check` validates the existing layout without modifying it. Resolve an unexpected profile, occupied port or config conflict from current evidence. Keep any live Chrome and OpenCode work intact.

## Install or repair

Read [the runtime contract](references/runtime-contract.md) before changing guard behavior. The entry points are `cdp-guard.mjs`, `mcp-session-server.mjs`, `browser-session-guard.js` and `browser-shared-chrome.ps1`.

```powershell
node install.mjs
```

The installer backs up browser-specific configuration, installs pinned dependencies in the OpenCode config directory, writes the global session plugin and launcher, preserves unrelated settings, and disables the duplicate DevTools alias. It does not stop browsers or restart OpenCode. On this established setup, update the existing startup shortcut with the bundled `configure-startup.ps1`; use `-Check` first. It backs up the original shortcut in the installation's backup folder before switching it to the hidden VBS launcher.

Keep these invariants:

- The plugin obtains the conversation identity from OpenCode's tool hook and overwrites any model-supplied identity. Missing identity fails closed.
- Every conversation/backend has independent MCP state and an owned-target CDP view. First actions create owned tabs. Popups inherit opener ownership; titles, URLs and shared tab indexes never establish ownership.
- Keep the existing default browser context so login remains shared. Do not create incognito contexts, copy cookies, clear profile storage or stop the browser to solve a lock conflict.
- A cancelled queued call does not run. Once dispatched, retain the conversation queue until the backend settles. Never replay an uncertain click/submission automatically.
- Chrome starts under a profile mutex with port/profile identity and readiness checks. Existing conflicting processes are left running.

## Verify and finish

Read [verification and recovery](references/verification.md) for the appropriate commands. For guard changes, run `npm test` and the real OpenCode integration fixture. Run the live test only within authorized browser testing; it creates synthetic localhost pages and preserves existing tabs. Do not treat a passed localhost test as proof of Upwork's server-side behavior.

Check the deployed files against the tested working copy and inspect **filtered** resolved OpenCode configuration. Report tested versions, counts, remaining limits and the restart requirement. Existing OpenCode processes retain old MCP/plugin configuration; the user should restart each window once when their work is saved.

Browser tools isolate tabs, but cookies/localStorage, server-side drafts and the shared account remain common. Assign an editable job/proposal to one conversation. This is protection from accidental browser-tool interference, not a sandbox against unrestricted shell/CDP access. No unlimited-concurrency guarantee is appropriate.

Use `restore.mjs --check "<backup-directory>"` to validate rollback and omit `--check` only when rollback is requested. Backups and installation metadata remain outside the skill/Git repository.
