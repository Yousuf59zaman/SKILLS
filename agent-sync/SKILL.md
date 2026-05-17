---
name: agent-sync
description: Unified agent-environment sync for Codex, Claude, and Antigravity. Use when Yousuf asks to sync agents, make Codex/Claude/Antigravity share the same skills, sync MCP servers between Codex and Antigravity, sync CLI/PATH access between agents, combine MCP sync with skills/CLI sync, run "agent sync", copy whichever side has extra skills/MCPs/CLIs to the others, or publish the unified skill set to GitHub.
---

# Agent Sync

Use this umbrella skill for agent environment synchronization.

It contains three sync tracks:

1. **Skills sync** — make Codex, Claude, and Antigravity share the same AgentSkill folder union.
2. **MCP sync** — make Codex and Antigravity share the same MCP server definition union.
3. **CLI sync** — make Codex and Antigravity terminals share PATH access for installed CLI tools.

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
- Copies missing skills on `--apply`.
- Replaces differing same-name skills with the newest recursive folder version, after backup.
- Can include GitHub as a sync/publish target with `--push-github`.
- Avoids Antigravity extension/vendor skill folders by default.

Useful commands:

```bash
node skills/agent-sync/scripts/sync-agent-skills.mjs --json
node skills/agent-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots
node skills/agent-sync/scripts/sync-agent-skills.mjs --apply --create-missing-roots --push-github
```

## MCP sync

Bundled script:

```bash
node skills/agent-sync/scripts/sync-codex-antigravity-mcp.mjs
```

What it does:

- Reads Codex MCPs from `%USERPROFILE%\.codex\config.toml`.
- Reads Antigravity MCPs from `%APPDATA%\Antigravity\User\mcp.json`.
- Adds Codex-only MCP servers to Antigravity.
- Appends Antigravity-only MCP servers to Codex.
- Creates `.bak-*` backups before writing.
- Reports same-name differences as conflicts instead of overwriting.
- Converts Codex `env_vars = ["NAME"]` to Antigravity `${env:NAME}` placeholders, and back when appending to Codex.

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
- Discovers installed CLI commands from the configured paths, current PATH, and known local CLI dirs.
- Ensures both Codex and Antigravity can see the CLI directories that expose those tools.
- Keeps Antigravity inheriting `${env:Path}`.
- Creates `.bak-*` backups before writing.
- Reports missing CLI commands instead of trying to install them.

Default verified CLI names include:

`codex`, `claude`, `gemini`, `postman-cli`, `supabase`, `vercel`, `firecrawl`, `higgsfield`, `designlang`, `designmd`, `antigravity`, `code`.

Useful commands:

```bash
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs --json
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs --apply
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs --cli docker,psql,mongosh --apply
```

## Standard workflow

1. Dry-run first unless Yousuf explicitly says to apply immediately.
2. Review missing/copy/replacement/conflict counts.
3. Apply with the smallest matching command.
4. Verify:

```bash
codex mcp list
node -e "JSON.parse(require('fs').readFileSync(process.env.APPDATA + '\\Antigravity\\User\\mcp.json','utf8')); console.log('antigravity mcp.json ok')"
openclaw skills list
node skills/agent-sync/scripts/sync-codex-antigravity-cli.mjs
```

## Safety rules

- Do not use `--push-github` unless Yousuf asks to publish/push skills.
- Do not copy into `.antigravity\extensions\...` vendor folders unless Yousuf explicitly provides that path.
- Do not overwrite same-name MCP conflicts without manual inspection and user confirmation.
- MCP sync copies definitions only; login/session state still belongs to each MCP/service.
- CLI sync shares PATH access only; it does not install missing CLIs.
- After MCP/CLI apply, tell Yousuf to reload/restart Antigravity if he wants it to notice new servers/PATH immediately.
