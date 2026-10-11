---
name: desktop-commander-autostart
description: Set up, repair, verify, or disable Desktop Commander Remote automatic startup in a visible Windows terminal at user sign-in. Use when the user asks to auto-run npx @wonderwhy-er/desktop-commander@latest remote, automatically accept its npm y confirmation, run the setup on an authorized remote PC, troubleshoot the startup launcher, or reproduce this setup on another Windows machine. Support a local Windows shell or the connected Remote Desktop Commander tools. Preserve existing remote sessions and unrelated startup items.
---

# Desktop Commander Autostart

Configure the current Windows user's sign-in launcher for:

```cmd
npx --yes @wonderwhy-er/desktop-commander@latest remote
```

Treat this as **sign-in startup**, not a service that runs before login. Keep the terminal visible. Use `--yes` for npm's installation prompt only; never pipe a blanket `y` into authentication or security prompts.

## Resources

- `scripts/Setup-Desktop-Commander-Autostart.cmd`: the tested installer and runtime launcher. No arguments install it; `--run` executes the guarded launcher without installing.
- `scripts/Test-Desktop-Commander-Autostart.ps1`: read-only JSON verification of paths, shortcut, command, and same-session processes.
- `references/operations.md`: troubleshooting, rollback, cross-agent distribution, sources, and verification limits.

## Execution workflow

1. **Resolve the actual machine and user.** For a remote request, discover the Remote Desktop Commander tools and select the authorized online device. For an agent already on the intended Windows PC, use its local shell. Verify `$env:USERPROFILE`, `$env:LOCALAPPDATA`, `[Environment]::GetFolderPath('Startup')`, Node, and `npx.cmd`. Do not hardcode a username or reuse a device ID from documentation. Do not treat a ChatGPT sandbox path as a remote Windows path.
2. **Inspect existing state.** Read the existing launcher and matching Startup shortcut; check for active Desktop Commander Remote processes. Run the bundled read-only verifier. A nonzero verifier result before installation can simply mean the setup is absent. If installation is already correct, avoid reinstalling. Before a requested repair, back up the existing `Start-Remote.cmd` and `Desktop Commander Remote.lnk` to a timestamped folder outside any synced skill directory. Never overwrite an unrelated file occupying these names.
3. **Place the installer on that device.** Transfer the bundled CMD file with a filesystem write tool, preserving its text and CRLF line endings, or use the local bundled copy. Ensure the parent directory exists. Read it back or verify its hash. A convenient remote staging location is `%LOCALAPPDATA%\DesktopCommander-Autostart\Setup-Desktop-Commander-Autostart.cmd`. Do not confuse transferring the file with executing it.
4. **Execute only when setup or repair is requested.** Invoke the installer with the real resolved Windows path, for example `& $installer` in PowerShell. Expect `SUCCESS: Auto-start is configured for this Windows user.` The installer deliberately ends at `pause`; send Enter to that same installer process using the interactive-process tool, then read its completion. Do not terminate the parent remote agent. Do not claim success from a file-write result alone.
5. **Verify the installation.** Run the bundled verifier in Windows PowerShell:

   ```powershell
   & powershell.exe -NoLogo -NoProfile -File "$skillRoot\scripts\Test-Desktop-Commander-Autostart.ps1"
   ```

   Resolve `$skillRoot` to this skill's actual directory. Require `Configured: true`, `ShortcutValid: true`, `NpxAvailable: true`, and empty `Errors`. Do not change a machine's execution policy to make the verifier run; an authorized shell may read the reviewed script text and execute it in its existing session instead.
6. **Test without disconnecting the working agent.** If the verifier confirms `RemoteAlreadyRunning: true`, run the bundled CMD with `--run`. Require `Desktop Commander Remote is already running. No duplicate was started.` If there is no active agent, launch the Startup shortcut only when the user requested actual setup/start and observe its output. First-time device authorization may still require the user. Never stop a working agent or reboot solely to perform this test.
7. **Report observable outcomes.** State the target PC, saved launcher and Startup shortcut, effective command, and checks actually performed. Distinguish configuration verification and duplicate-guard testing from a real next-login or reboot test. Tell the user that minimizing is fine, but closing the agent terminal ends that session.

## Installed layout and behavior

```text
%LOCALAPPDATA%\DesktopCommander-Autostart\Start-Remote.cmd
<current user's Startup folder>\Desktop Commander Remote.lnk
```

Create the shortcut to `%SystemRoot%\System32\cmd.exe` with `WindowStyle=1`, the launcher directory as its working directory, and the exact quoted arguments:

```text
/d /c ""<absolute launcher path>" --run"
```

Retain the installer's behaviors: a same-Windows-session process guard, no duplicate agent if one is found, at most five failed-start attempts with 30-second intervals, and a visible diagnostic pause after normal exit or exhausted retries. Treat npm and its remote child as one process tree; two matching Node PIDs do not by themselves establish two independent agents.

## Disable or distribute

For an explicit disable request, verify and remove only `Desktop Commander Remote.lnk` from this user's Startup folder. Leave the running session and installed script intact. Do not delete any other startup item. Read `references/operations.md` for rollback and troubleshooting.

When asked to distribute this skill to Codex and other agents, load the user's existing `agent-sync` skill and run **only its skills track**, dry-run first. Preserve its configured roots and GitHub comparison safeguards. Prefer missing-only sync for a new skill. Do not run its `all`, tools, MCP, or CLI tracks, and do not push to GitHub without a separate explicit publish decision. Verify every bundle file across the target roots. Merely installing or syncing the skill must not enable another machine's auto-start.

## Boundaries

Use only an authorized Windows account and existing supported access. Do not elevate, install a hidden service, add scheduled tasks, change firewall settings, weaken command restrictions, copy credentials, or alter machine-wide startup. Preserve the live connection. Do not claim installation in ChatGPT's hosted Skills library when only local agent folders were updated.
