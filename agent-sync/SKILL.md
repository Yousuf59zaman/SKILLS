---
name: agent-sync
description: Unified agent-environment sync for Codex, Claude, Antigravity, VSCode, and OpenCode. Use when Yousuf asks to sync agents, make Codex/Claude/Antigravity/VSCode/OpenCode share the same skills, sync MCP servers across Codex/Antigravity/VSCode/OpenCode, sync CLI/PATH access across agents, combine MCP sync with skills/CLI sync, run "agent sync", copy whichever side has extra skills/MCPs/CLIs to the others, or publish the unified skill set to GitHub.
---

# Agent Sync

Use this umbrella skill for agent environment synchronization.

It contains four sync tracks:

1. **Skills sync** — make Codex, Claude, Antigravity, VSCode, and OpenCode share the same AgentSkill folder union.
2. **Tools setup** — check/install the top developer MCP/CLI tool set and add safe Codex + VSCode + OpenCode MCP blocks.
3. **MCP sync** — make Codex, Antigravity, VSCode, and OpenCode share the same MCP server definition union.
4. **CLI sync** — make Codex, Antigravity, and VSCode terminals share PATH access for installed CLI tools.

## Quick commands

Dry-run everything:

```bash
node skills/agent-sync/scripts/agent-sync.mjs all
```

Apply everything:

```bash
node skills/agent-sync/scripts/agent-sync.mjs all --apply --create-missing-roots
```

Run one track only:

```bash
node skills/agent-sync/scripts/agent-sync.mjs skills --apply --create-missing-roots
node skills/agent-sync/scripts/agent-sync.mjs tools --apply
node skills/agent-sync/scripts/agent-sync.mjs mcp --apply
node skills/agent-sync/scripts/agent-sync.mjs cli --apply
```

## Skills sync

Bundled script:

```bash
node skills/agent-sync/scripts/sync-agent-skills.mjs
```

What it does:

- Inventories skill folders containing `SKILL.md`.
- Syncs the union across default roots:
  - Codex: `%USERPROFILE%\.codex\skills`
  - Claude: `%USERPROFILE%\.claude\skills`
  - Antigravity: `%USERPROFILE%\.gemini\antigravity\skills`
  - VSCode: `%USERPROFILE%\.vscode\skills`
  - OpenCode: `%USERPROFILE%\.config\opencode\skills`
- Copies missing skills on `--apply`.
- Replaces differing same-name skills with the newest recursive folder version, after backup.
- Blocks replacement when different versions have near-tied mtimes, so a risky "newest" choice is not guessed.
- On `--apply`, preserves every near-tied differing candidate in a conflict bundle without changing the active skill folders.
- Always compares the local skill union with the configured GitHub Skills repo during normal dry-run/apply, unless Yousuf explicitly asks for local-only and `--no-github-check` is used.
- Can include GitHub as a sync/publish target with `--push-github`, after Yousuf chooses the GitHub action.
- Avoids Antigravity extension/vendor skill folders by default.

Useful commands:

```bash
node skills/agent-sync/scripts/sync-agent-skills.mjs --json
node skills/agent-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots
node skills/agent-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots --no-content-sync
node skills/agent-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots --push-github --github-decision merge-and-push-branch
node skills/agent-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots --push-github --github-decision merge-and-push-branch --github-branch-prefix agent-sync
```

Same-name content differences:

- Dry-run reports skills that exist in every root but have different folder content.
- `--apply` automatically replaces older differing copies from the clearly newest modified copy.
- Before replacement, the script backs up the target folder under `%USERPROFILE%\.openclaw\workspace\backups`.
- If two different versions have mtimes within the ambiguity window, the script blocks that skill instead of guessing.
- During `--apply`, ambiguous blocked versions are also copied to `%USERPROFILE%\.openclaw\workspace\backups\agent-skills-union-sync-<timestamp>\conflicts\<skill-id>\...` with a `manifest.json`; active Codex/Claude/Antigravity/VSCode/OpenCode skill folders stay unchanged for that skill.
- If two locations both look newest and content differs, keep both by preserving the conflict bundle. Inspect manually, touch the intended source copy to make it clearly newest, or pass `--allow-ambiguous-latest` only when Yousuf explicitly accepts latest-wins risk.
- Use `--no-content-sync` when you only want missing skills copied and never want existing same-name skills replaced.

GitHub publish safety:

- GitHub compare is mandatory for skills sync. Every normal dry-run/apply must report the GitHub repo status, ahead/behind state, local-only skills, GitHub-only skills, same-name content differences, and ambiguous conflicts.
- If GitHub differs from local roots, ask Yousuf which action he wants before any GitHub write. Do not silently choose pull, push, merge, or conflict strategy.
- Valid choices to offer:
  - `local-only`: do not touch GitHub this run.
  - `pull-merge`: pull GitHub-only/newer skills into Codex, Claude, Antigravity, VSCode, and OpenCode first.
  - `merge-and-push-branch`: merge newest both ways and push a new branch.
  - `direct-push`: push to the checked-out GitHub branch only when Yousuf explicitly asks.
  - `manual-conflict-review`: keep conflicting newest versions preserved for inspection.
- Use `--no-github-check` only when Yousuf explicitly says this run is local-only.
- Use `--push-github` only with `--apply` after Yousuf chooses a GitHub publish/merge action; the script also requires `--github-decision` so direct CLI runs cannot skip the decision gate.
- For safe publish, use `--github-decision merge-and-push-branch` so the script pushes a new branch.
- For direct push, use both `--github-decision direct-push` and `--github-direct-push`, only when Yousuf explicitly chooses direct push.
- Default behavior creates and pushes a new branch named `agent-sync/<timestamp>` instead of pushing directly to the current branch.
- Use `--github-branch <name>` for a chosen publish branch, or `--github-branch-prefix <name>` for generated branch naming.
- Use `--github-direct-push` only when Yousuf explicitly asks to push directly to the checked-out branch.
- The script refuses to publish when the Git worktree has pre-existing uncommitted changes, when `git pull --ff-only` fails, when ambiguous skill conflicts exist, or when credential-like files are detected.
- Never force-push from this skill. If push fails after commit, rerun after pulling the new remote state or inspect manually.

## Tools setup

Bundled script:

```bash
node skills/agent-sync/scripts/ensure-dev-tools.mjs
```

What it checks:

`codex`, Gemini CLI (`gemini`), Claude CLI (`claude`), Antigravity CLI/app launcher (`antigravity`), `git`, GitHub MCP, `gh`, Playwright MCP, Chrome DevTools MCP, Context7 MCP, Firecrawl MCP, Sentry MCP, MCP Toolbox for Databases, `docker`, `kubectl`, `helm`, `terraform`, `supabase`, `vercel`, Postman CLI (`postman`), `pnpm`, `uv`, `rg`, and `jq`.

What `--apply` does:

- Installs missing CLI tools with trusted package managers (`winget` or `npm -g`) when an installer is known.
- Installs missing npm MCP packages for Playwright, Chrome DevTools, Context7, Firecrawl, and Sentry.
- Adds missing Codex MCP config blocks for GitHub, Playwright, Chrome DevTools, Context7, Firecrawl, Sentry, and MCP Toolbox.
- Adds missing VSCode MCP server definitions to `%APPDATA%\Code\User\mcp.json` for the same set.
- Adds missing OpenCode MCP server definitions to `%USERPROFILE%\.config\opencode\opencode.jsonc` for the same set, using OpenCode's JSONC format (`command` as array, `type: "local"`, `environment` key, `{env:NAME}` placeholders, `enabled: true`).
- Creates a safe `antigravity.cmd` launcher in `%USERPROFILE%\.local\bin` only when a real Antigravity IDE/app target exists.
- Leaves already-present tools and existing MCP blocks unchanged.
- Creates a Codex config backup, VSCode mcp.json backup, and OpenCode opencode.jsonc backup before adding blocks unless `--no-backup` is passed.
- Uses environment variable placeholders for secrets. Do not write tokens into config files.

Useful commands:

```bash
node skills/agent-sync/scripts/ensure-dev-tools.mjs --json
node skills/agent-sync/scripts/ensure-dev-tools.mjs --apply
node skills/agent-sync/scripts/agent-sync.mjs all --apply --create-missing-roots
```

MCP safety notes:

- GitHub MCP uses Docker and expects `GITHUB_PERSONAL_ACCESS_TOKEN` in the environment when used. It is configured read-only by default.
- Chrome DevTools MCP uses the local Chrome/Chromium debugging bridge. Use it only for browser pages you intend the agent to inspect or control.
- Context7 can run keyless but supports `CONTEXT7_API_KEY` for higher limits.
- Firecrawl can run keyless for limited search/scrape, and can use `FIRECRAWL_API_KEY` later.
- Sentry MCP starts without a stored token; authenticate with Sentry's supported flow or provide `SENTRY_ACCESS_TOKEN` when needed.
- MCP Toolbox is configured against a local SQLite file at `%USERPROFILE%\.codex\mcp-toolbox\dev.sqlite` so it is safe by default.

## MCP sync

Bundled script:

```bash
node skills/agent-sync/scripts/sync-codex-antigravity-mcp.mjs
```

What it does:

- Reads Codex MCPs from `%USERPROFILE%\.codex\config.toml`.
- Reads Antigravity MCPs from `%APPDATA%\Antigravity\User\mcp.json`.
- Reads VSCode MCPs from `%APPDATA%\Code\User\mcp.json`.
- Reads OpenCode MCPs from `%USERPROFILE%\.config\opencode\opencode.jsonc` (JSONC with comments stripped before parsing).
- Computes the union across all four targets and adds missing servers to whichever target lacks them.
- Creates `.bak-*` backups before writing.
- Reports same-name differences as conflicts instead of overwriting.
- Converts between formats: Codex `env_vars = ["NAME"]` to JSON `${env:NAME}` for Antigravity/VSCode and to `{env:NAME}` for OpenCode; OpenCode `command` arrays are split into `command` + `args` when writing to other targets; OpenCode `environment` key maps to `env` in other targets.

Useful commands:

```bash
node skills/agent-sync/scripts/sync-codex-antigravity-mcp.mjs --json
node skills/agent-sync/scripts/sync-codex-antigravity-mcp.mjs --apply
```

## CLI sync

Bundled script:

```bash
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs
```

What it does:

- Reads Codex terminal PATH from `%USERPROFILE%\.codex\config.toml`.
- Reads Antigravity terminal PATH from `%APPDATA%\Antigravity\User\settings.json`.
- Reads VSCode terminal PATH from `%APPDATA%\Code\User\settings.json`.
- Discovers installed CLI commands from the configured paths, current PATH, and known local CLI dirs.
- Ensures Codex, Antigravity, and VSCode can all see the CLI directories that expose those tools.
- Keeps Antigravity and VSCode inheriting `${env:Path}`.
- Creates `.bak-*` backups before writing.
- Reports missing CLI commands instead of trying to install them.

Default verified CLI names include:

`codex`, `git`, `gh`, `docker`, `kubectl`, `helm`, `terraform`, `supabase`, `vercel`, `postman`, `pnpm`, `uv`, `rg`, `jq`, `toolbox`, `firecrawl`, `claude`, `gemini`, `antigravity`, `antigravity-ide`, `code`.

Useful commands:

```bash
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs --json
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs --apply
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs --cli docker,psql,mongosh --apply
```

## Standard workflow

1. Dry-run first unless Yousuf explicitly says to apply immediately.
2. Review missing/copy/replacement/conflict counts.
3. Review the mandatory GitHub compare section.
4. If GitHub differs, ask Yousuf to choose `local-only`, `pull-merge`, `merge-and-push-branch`, `direct-push`, or `manual-conflict-review` before running any GitHub write.
5. Apply with the smallest matching command after the decision.
6. Verify:

```bash
codex mcp list
node -e "JSON.parse(require('fs').readFileSync(process.env.APPDATA + '\\Antigravity\\User\\mcp.json','utf8')); console.log('antigravity mcp.json ok')"
node -e "JSON.parse(require('fs').readFileSync(process.env.APPDATA + '\\Code\\User\\mcp.json','utf8')); console.log('vscode mcp.json ok')"
node -e "const t=require('fs').readFileSync(require('path').join(require('os').homedir(),'.config','opencode','opencode.jsonc'),'utf8').replace(/\\/\\/.*$/gm,'').replace(/\\/\\*[\\s\\S]*?\\*\\//g,''); JSON.parse(t); console.log('opencode opencode.jsonc ok')"
openclaw skills list
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs
```

## Safety rules

- Do not skip GitHub comparison unless Yousuf explicitly asks for a local-only run.
- Do not use `--push-github` unless Yousuf chooses to publish/push skills after the mandatory compare.
- Do not direct-push to GitHub unless Yousuf explicitly asks for direct push after seeing the compare.
- Do not copy into `.antigravity\extensions\...` vendor folders unless Yousuf explicitly provides that path.
- Do not overwrite same-name MCP conflicts without manual inspection and user confirmation.
- MCP sync copies definitions only; login/session state still belongs to each MCP/service.
- CLI sync shares PATH access only; it does not install missing CLIs.
- After MCP/CLI apply, tell Yousuf to reload/restart Antigravity, VSCode, and OpenCode if he wants them to notice new servers/PATH immediately.
