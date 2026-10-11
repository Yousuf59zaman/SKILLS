# Operations and verification notes

## Troubleshooting

- Resolve all paths from the executing Windows user's environment. A remote shell running as another account will configure that other account's sign-in.
- Keep `--yes` before the package name. It suppresses npm package-install confirmation, not Desktop Commander authorization or other security prompts.
- Keep the user-requested `@latest`; note that it can resolve to a newer package on a later start. Do not silently pin or replace it.
- Preserve CMD double-quoting for paths with spaces. Use a `.lnk` pointing to `cmd.exe`, not directly to an incorrectly quoted inline command.
- Keep the launcher outside the Startup folder; put only its shortcut there. Re-running the installer reuses the same path rather than adding another startup entry.
- Wait for the installer's SUCCESS or error output before sending Enter to its final pause. On remote tools, read a pending call's result or process output instead of resubmitting a side-effecting call.
- Two matching Node processes can be the npx parent and its remote child. Inspect parent IDs before concluding that separate agents exist.
- If process inspection fails, the launcher deliberately refuses to start another agent. Do not remove this safety check to hide the failure.
- The retry limit covers a command that exits nonzero. It does not impose a timeout on a hung npm command or override the remote client's own reconnection behavior.
- Missing network or npm errors are printed in the visible terminal. Five failed starts exhaust the retry loop; fix the cause, then launch the shortcut again.
- `Configured: true` verifies files and shortcut contents; it does not prove Windows startup policy allows execution or that a future login succeeds. Check Task Manager's Startup apps and organizational restrictions if it does not run at sign-in. Do not bypass administrator restrictions.
- On a machine without established remote authorization, follow the supported interactive authentication flow. Do not put passwords, tokens, device IDs, or account details into this skill.

## Backup and rollback

Before repairing an existing installation, copy just its launcher and matching shortcut into a timestamped directory under `%LOCALAPPDATA%\DesktopCommander-Autostart\backups`. Do not store backup binaries or logs in the skill bundle. Restore those two exact files if repair fails, and re-run verification. Do not stop the live remote agent as part of rollback.

To disable future startup on explicit request, remove only the verified `Desktop Commander Remote.lnk` from `[Environment]::GetFolderPath('Startup')`. The running session remains unchanged. Re-enable by running the installer after inspecting any retained script.

## Cross-agent installation

Treat the user's existing agent-sync skill as the source of truth. A previously verified deployment used these roots; rediscover them before reuse:

```text
%USERPROFILE%\.codex\skills
%USERPROFILE%\.claude\skills
%USERPROFILE%\.gemini\antigravity\skills
%USERPROFILE%\.vscode\skills
%USERPROFILE%\.config\opencode\skills
```

Add the complete `desktop-commander-autostart` folder to the configured source root. Read `agent-sync/SKILL.md` and its current script options. For the observed sync version, missing-only dry-run/apply uses:

```powershell
node "$syncScript" --no-content-sync --json
node "$syncScript" --apply --create-missing-roots --no-content-sync --json
```

Resolve `$syncScript` to its actual `sync-agent-skills.mjs` path. Review planned operations and the GitHub comparison first. Do not use `--no-github-check` without the user's explicit local-only instruction. Do not use `--push-github`, choose a GitHub merge strategy, run all tracks, or replace unrelated skill versions merely to add this skill. A pending GitHub decision need not block the requested local copies. Report GitHub differences without publishing.

After sync, compare relative paths and SHA-256 hashes for every bundled file across all roots. Verify file installation separately from a live UI skill-picker check. Start a new agent conversation or refresh its skill list when needed; never restart agents with unsaved work automatically. This filesystem sync is not a ChatGPT hosted-skill upload.

## Verified baseline and test limits

The bundled CMD installer is byte-for-byte the installer exercised during the original Windows setup. Its SHA-256 is `138200fb3a7a60b169cfcf86b047e2098cce81627fbe2f71fd5dbf8a722b7068`.

The original run saved the launcher and shortcut and returned SUCCESS. The `--run` test exited without starting a duplicate because the remote agent was already running. This is not a reboot, next-login, first-time authorization, or simulated network-failure test. Revalidate on each target machine.

## Official references

- npm confirmation and npx argument order: https://docs.npmjs.com/cli/v11/commands/npm-exec/
- Windows per-user Startup folder and sign-in behavior: https://support.microsoft.com/en-US/Windows/Experience/Startup-Boot/configure-startup-applications-in-windows
- Agent skill structure: https://developers.openai.com/plugins/concepts/skills
