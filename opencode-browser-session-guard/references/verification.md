# Verification and recovery

Run these inside the prepared working copy after `npm ci --ignore-scripts --no-audit --no-fund`:

| Command | Coverage and side effects |
|---|---|
| `npm test` | Disposable Chrome profiles; browser/launcher regression tests plus installer checks |
| `node tests/opencode-integration.mjs` | Four real OpenCode conversations with a local scripted model and isolated config; no external AI-account usage |
| `node tests/live.mjs` | Installed runtime on port 9222; four synthetic localhost tabs, a temporary synthetic cookie, and cleanup of only the test-owned tabs |
| `node tests/baseline.mjs` | Demonstrates original unguarded takeover using disposable Chrome only; use when comparing the original design |
| `node install.mjs --check` | Validates the current installation target and profile without writing |
| `powershell -NoProfile -File configure-startup.ps1 -Check` | Inspects the existing startup shortcut without writing |

Tests cover eight parallel MCP conversations, independent same-site drafts, shared synthetic cookie/localStorage, popups/named popups, foreign and stale IDs, index shifts, external tab closure, redirects, backend reconnect, disposable Chrome restart, slow/cancelled work, native form tools, dialogs, images and launcher races. A closed-page race may correctly return an error; inspect tabs before an explicit retry. A test must not assert silent action replay as desirable recovery.

The original audit passed 24/24 automated tests, four real OpenCode conversations and four live synthetic conversations. Ten existing tabs retained their IDs/URLs, and all test tabs were removed. These are historical results: report fresh counts when rerunning, and distinguish the supplied fixture from real account workflows.

`tests/support.mjs` uses the installed Chrome executable under LOCALAPPDATA. `tests/opencode-integration.mjs` expects the npm-installed OpenCode executable under APPDATA. If a machine uses system-wide paths, locate the actual executables and adapt the fixture; do not replace a live profile to make a test pass.

For final installation verification, compare the runtime/plugin/rule files with the tested bundle. Capture `opencode debug config` internally and print only whether the guard plugin, guarded browser entries and rule are present. Do not print unrelated environment values, provider credentials or live browser target lists. A live-test failure involving a pre-existing changed page may indicate concurrent user/agent activity; investigate before attributing it to the guard.

The installer writes `artifacts/installation.json` in the prepared directory. That local file identifies the rollback folder under the OpenCode config `backups` directory. `restore.mjs --check "<backup>"` validates it without mutation; omitting `--check` restores browser entries, launcher/rules and the old plugin/shortcut when available. It leaves Chrome running and preserves unrelated config. The former direct-CDP setup restores the original interference risk.

Keep generated profiles, screenshots, logs, cookies, startup backups and installation metadata out of the reusable skill and commits. Copy only maintained source/templates and lockfiles when updating the skill.
