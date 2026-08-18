---
name: office-repo-personal-mirror
description: "One-time setup that mirrors an approved office GitHub repository into a tool-managed private repo on the personal GitHub account, plus the daily 'git chatgpt-sync' command that pushes the office remote first and then force-reconciles the personal mirror (all branches, tags, LFS objects). Use when the user asks to connect an office repo to personal GitHub so the ChatGPT GitHub connector can read it, or to set up / run / check the mirror for any current or future office project."
metadata:
  allow_implicit_invocation: false
---

# Office Repo -> Personal GitHub Mirror (for ChatGPT)

One local working folder only. The office repository stays the source of truth; a tool-managed
private mirror on the personal GitHub account is what the ChatGPT GitHub connector reads.
No Repomix, no second editable folder, no reverse sync.

## Hard contract (never violate)

- Personal mirror repos are ALWAYS private, never edited manually, never pushed to directly.
- Office remotes/settings are never modified by this skill (only normal non-force developer pushes of the current branch).
- Force/push --prune is applied ONLY towards the personal mirror, never towards the office remote.
- Setup requires explicit user approval per repo after showing the exact office source remote URL and the exact personal destination (account/repo name).
- If the secret audit flags tracked files, setup stops; `-AcceptSecretRisk` may only be used after the user explicitly approves the flagged list.
- If ssh-agent needs elevation, show the exact admin commands and stop; never create an unencrypted key as a fallback.
- Submodules are never mirrored automatically; each authorized submodule is registered by running this skill inside it.
- ChatGPT-created commits/PRs and personal-to-office reverse sync are out of scope.
- Never print, store, or log tokens or private keys.

## Prerequisites (once per machine)

1. GitHub CLI installed and BOTH accounts logged in (office may already be active):
   - `gh auth status`
   - if the personal account is missing: `gh auth login --hostname github.com` and sign in with the PERSONAL account (gh keeps multiple accounts; active account is restored automatically by the setup).
2. ssh-agent service enabled once from an elevated PowerShell (setup stops and shows these exact commands if needed):
   - `Set-Service ssh-agent -StartupType Automatic`
   - `Start-Service ssh-agent`
3. Run setup in an interactive terminal (SSH key passphrase prompts).

## One-time setup per office repo (run inside the office working folder)

1. Confirm with the user: office repo path, office remote name (default `origin`), personal GitHub username, and the planned personal repo name (default `chatgpt-mirror-<office-repo-name>`). Show office source URL + personal destination and get explicit approval.
2. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\Setup-Mirror.ps1" -RepoPath "<office-repo-path>" -PersonalAccount "<personal-github-username>" [-PersonalRepoName "<name>"] [-OfficeRemote "<name>"]
```

   (Path of this skill on this machine: `%USERPROFILE%\.codex\skills\office-repo-personal-mirror`.)

3. Setup will: audit repo state + tracked secrets/LFS/submodules; create the empty PRIVATE personal repo with GitHub Actions disabled; create/passphrase-protect an Ed25519 key with a dedicated `github-personal-mirror` SSH host alias (existing SSH config preserved); enable+load it via ssh-agent; add the local-only `chatgpt-mirror` remote, `mirror.*` config and the `git chatgpt-sync` alias to `.git/config`; initial-sync the default branch, ALL office branches and tags (plus LFS objects); set the personal default branch to the office default; verify the repo is PRIVATE; restore the previous gh active account on every success/failure path.
4. After success, remind the user: if the ChatGPT GitHub connector does not show the new repo, add it in the connector's repository access (GitHub App "selected repositories").

## Daily usage (after committing)

- `git chatgpt-sync` — safety checks, then normal non-force push of the current branch to the office remote FIRST; only if that succeeds, force-reconcile + prune the personal mirror (branches, tags, LFS). Office push failure leaves the personal repo untouched.
- `git chatgpt-sync --status` — read-only comparison of both remotes (ls-remote only, no writes); exits 0 when in sync.

Abort conditions for sync: unresolved conflicts, in-progress merge/rebase/cherry-pick/revert, detached HEAD, uncommitted changes to tracked files. Untracked files only warn (they are never mirrored; the connector only sees committed/pushed history).

Partial personal push failure prints the divergence and is fixed by rerunning `git chatgpt-sync`.

## Troubleshooting

- `Personal mirror push failed` / SSH auth: `ssh-add "%USERPROFILE%\.ssh\github-personal-mirror"` in an interactive terminal; verify `ssh -T git@github-personal-mirror`.
- `OFFICE PUSH FAILED`: fix the normal office push (pull/rebase, auth) and rerun; personal was untouched.
- Repo not visible in ChatGPT connector: add it to the GitHub App's selected repositories in the personal account settings.
- Regression tests (disposable local bare repos, no network): `powershell -NoProfile -ExecutionPolicy Bypass -File "tests\Test-MirrorSandbox.ps1"`.

## Files

- `scripts/MirrorCommon.ps1` — shared git/refmap/safety helpers.
- `scripts/Setup-Mirror.ps1` — one-time per-repo setup (supports `-Sandbox -SandboxPersonalRemote <path>` for offline testing).
- `scripts/Sync-Mirror.ps1` — daily sync + `--status`.
- `tests/Test-MirrorSandbox.ps1` — full sandbox test plan.
- `agents/openai.yaml` — skill interface metadata.
