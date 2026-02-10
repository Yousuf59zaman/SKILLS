---
name: skills-sync-setup
description: Set up or repair the Windows skills sync system that keeps %USERPROFILE%\.codex\skills (git repo source) synced into %USERPROFILE%\.claude\skills and %USERPROFILE%\.gemini\antigravity\skills using git hooks, a logon Startup task, and a one-click sync script. Use when onboarding a new PC, after cloning/pulling the skills repo, or when hooks/startup/sync scripts are missing or broken.
---

# Skills Sync Setup

Install per-machine automation (git hooks + Windows Startup sync) so that edits/commits in `%USERPROFILE%\.codex\skills` automatically propagate into:
- `%USERPROFILE%\.claude\skills`
- `%USERPROFILE%\.gemini\antigravity\skills`

## Install

Run the installer from the Codex skills repo:

```powershell
cd $env:USERPROFILE\.codex\skills
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.github\install-skills-sync.ps1"
```

This must be run once per machine because git hooks and the Windows Startup folder are not stored in the git repo.

## Daily Workflow

- Edit skills in `%USERPROFILE%\.codex\skills`
- Commit changes:

```powershell
cd $env:USERPROFILE\.codex\skills
git add -A
git commit -m "Update skills"
```

The `post-commit` hook runs sync automatically.

## One-Click Manual Sync

Double-click:
- `%USERPROFILE%\.codex\skills\.github\sync-skills.cmd`

It attempts `git pull --ff-only` first, then copies the current `%USERPROFILE%\.codex\skills` working tree into Claude and Gemini.

## Verify

- Change any file under `%USERPROFILE%\.codex\skills` (for example a `SKILL.md`).
- Commit it.
- Confirm the same file changed under `%USERPROFILE%\.claude\skills` and `%USERPROFILE%\.gemini\antigravity\skills`.

## Troubleshooting

- Log file: `%USERPROFILE%\.codex\log\skills-sync.log`
- If `git pull --ff-only` fails, pull/resolve manually in `%USERPROFILE%\.codex\skills`, then run `sync-skills.cmd` again.
- If sync stops running after commits, re-run `install-skills-sync.ps1`, then confirm these exist:
- `%USERPROFILE%\.codex\skills\.git\hooks\post-commit`
- `%USERPROFILE%\.codex\skills\.git\hooks\post-merge`
- `%USERPROFILE%\.codex\skills\.git\hooks\post-checkout`
