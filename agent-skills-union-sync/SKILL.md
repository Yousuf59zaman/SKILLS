---
name: agent-skills-union-sync
description: Audit and synchronize AgentSkill folders across Codex, Claude, and Antigravity skill roots, then optionally publish the final unified skills set to Yousuf's GitHub `SKILLS` repo. Use when Yousuf asks to compare `.codex`, `.claude`, and `.antigravity` skills, make every unique skill available to all three agents, copy missing skills between agents, resolve differing same-name skills by keeping the newest version, or push the unified skill set to GitHub.
---

# Agent Skills Union Sync

Use the bundled script to make Codex, Claude, and Antigravity share the same union of user skills without overwriting existing/common skills.

## What it does

- Inventories skill folders that contain `SKILL.md`.
- Computes:
  - identical common skills already present in all roots with the same folder content,
  - skills present in all roots but with different instructions/resources,
  - skills unique to one root,
  - missing placements needed so every root has the union.
- Treats “common” as **same skill id + same folder content**, not just same folder/name.
- If content differs even slightly, chooses the newest version by recursive file/folder mtime and copies that version to the other roots.
- Copies missing skill folders on `--apply`.
- Replaces outdated differing skill folders on `--apply`, after backing them up.
- Can publish the final unified set to GitHub with `--push-github`, using Codex as the default source because all three roots should match after sync.
- Never overwrites an unrelated existing destination folder.
- Ignores dot/system/vendor folders by default, including `.system`, `.github`, `.tmp`, `tmp`, `node_modules`, `vendor_imports`, and backups.

## Default roots

- Codex: `%USERPROFILE%\.codex\skills`
- Claude: `%USERPROFILE%\.claude\skills`
- Antigravity: `%USERPROFILE%\.gemini\antigravity\skills`

Important: installed Antigravity extensions may contain vendor `skills` folders under `.antigravity\extensions\...`; do **not** sync into those extension folders unless Yousuf explicitly gives that path. The safe global Antigravity default is `.gemini\antigravity\skills`; create missing roots only with `--create-missing-roots`.

## Standard workflow

From the skill directory or workspace root, run a dry-run first:

```bash
node skills/agent-skills-union-sync/scripts/sync-agent-skills.mjs
```

If the plan looks correct, apply. This copies missing skills and replaces older differing copies with the newest version, with backups:

```bash
node skills/agent-skills-union-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots
```

When Yousuf wants the unified skills pushed to his GitHub `Yousuf59zaman/SKILLS` repo too, run:

```bash
node skills/agent-skills-union-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots --push-github
```

Use JSON when you need exact evidence:

```bash
node skills/agent-skills-union-sync/scripts/sync-agent-skills.mjs --json
```

## GitHub publishing

Default GitHub publish settings:

- Repo: `Yousuf59zaman/SKILLS`
- Local worktree: `%USERPROFILE%\.codex\skills\.github\Yousuf59zaman-SKILLS`
- Publish source after local sync: Codex root (`%USERPROFILE%\.codex\skills`)

The script pulls the repo, copies discovered non-dot skill folders from the source root into the repo, commits only if there are changes, and pushes. It refuses to continue if the GitHub worktree already has uncommitted changes before the sync.

Override if needed:

```bash
node skills/agent-skills-union-sync/scripts/sync-agent-skills.mjs --apply --push-github --github-repo Yousuf59zaman/SKILLS --github-source codex
```

## Override roots

Use explicit roots when Antigravity or another agent uses a different skills folder:

```bash
node skills/agent-skills-union-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots --antigravity-root "C:\path\to\antigravity\skills"
```

You can add/override any root:

```bash
node skills/agent-skills-union-sync/scripts/sync-agent-skills.mjs --root pi="D:\agents\pi\skills"
```

## Safety rules

- Dry-run before `--apply` unless Yousuf explicitly says to apply immediately.
- Do not copy into `.antigravity\extensions\...` vendor paths by default.
- Do not use `--include-dot` unless Yousuf explicitly wants system/dot skills included.
- Do not use `--no-content-sync` unless Yousuf explicitly wants old behavior that only fills missing skills.
- Use `--push-github` only when Yousuf requested GitHub publication/push.
- If the script reports `blocked-existing-path`, inspect manually instead of overwriting.
- Report concise counts: each root count, identical common count, differing common count, union count, unique-by-root counts, copied count, replaced count, backup root, GitHub commit/push status, blocked count.
