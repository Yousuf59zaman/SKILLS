---
name: opencode-sync
description: Repair and sync OpenCode Go routing for Codex Desktop/Relay AI and OpenClaw. Use when Yousuf asks to set up OpenCode Go, make GLM-5.2 the default model, use Qwen3.7 Plus for vision, fix Relay AI limited-tool Codex sessions, remove Relay AI routing from OpenClaw, sync OpenCode models across agents, or verify Browser/MCP/tool access after OpenCode changes.
---

# OpenCode Sync

Use this skill to keep Yousuf's OpenCode Go setup consistent across Codex Desktop/Relay AI and OpenClaw.

Core policy:

- Codex Desktop may stay on Relay AI for OpenCode Go.
- OpenClaw should use direct OpenCode Go auth/config, not Relay AI proxy/auth.
- `glm-5.2` is the default text/coding model.
- `qwen3.7-plus` is the vision-capable OpenCode Go model.
- Never print API keys, OAuth tokens, cookies, bearer tokens, or auth-state file contents.
- Do not change `main-cron` when applying OpenClaw agent model routing unless the user explicitly asks.

## Quick Start

Audit first:

```bash
node "$SKILL_DIR/scripts/opencode-sync.mjs" --target all
```

Apply safe repairs:

```bash
node "$SKILL_DIR/scripts/opencode-sync.mjs" --target all --apply
```

Useful narrower runs:

```bash
node "$SKILL_DIR/scripts/opencode-sync.mjs" --target codex --apply
node "$SKILL_DIR/scripts/opencode-sync.mjs" --target openclaw --apply
node "$SKILL_DIR/scripts/opencode-sync.mjs" --target all --json
```

Defaults can be overridden:

```bash
node "$SKILL_DIR/scripts/opencode-sync.mjs" --default-model glm-5.2 --vision-model qwen3.7-plus --agents clawdbot_agent,openclawy_agent,moltbot_agent --apply
```

## Workflow

1. Read `references/opencode-routing.md` before manual config edits or when the script reports a manual action.
2. Run the script in audit mode.
3. Apply only if the requested scope is clear.
4. Verify with the checks printed by the script.
5. Restart existing Codex/OpenClaw sessions after model-catalog or runtime changes; existing sessions may keep old tool/model metadata.

## What The Script Repairs

For Codex Desktop with Relay AI:

- Enables `js_repl = true` in `C:\Users\User\.codex\config.toml`.
- Removes obsolete `rmcp_client` feature warnings.
- Patches the local Relay AI package so Codex app catalogs advertise shell, apply_patch, and parallel tool support.
- Generates `C:\Users\User\.relay-ai\codex\app-models-go.json` with `glm-5.2` first.
- Marks `glm-5.2` text-only and `qwen3.7-plus` text+image.
- Patches Relay's Windows Codex launcher to preserve multi-word prompts when spawning Codex.

For OpenClaw:

- Ensures the direct `opencode-go` provider exists with `glm-5.2` and `qwen3.7-plus` model entries.
- Sets only the selected non-cron agents to `opencode-go/glm-5.2`.
- Leaves `main-cron` untouched by default.
- Reports Relay AI leftovers for manual cleanup instead of deleting unknown auth material.

## Verification

Run these after apply when relevant:

```bash
relay-ai codex-app --config
codex mcp list
node --check "$APPDATA/npm/node_modules/@jacobbd/relay-ai/dist/cli.js"
openclaw configure --section model
```

Expected Codex state:

- `relay-ai codex-app --config` shows OpenCode Go and `glm-5.2`.
- `codex mcp list` includes `node_repl`.
- Browser tasks discover Node REPL through `tool_search`, not `list_mcp_resources`.

Expected OpenClaw state:

- `opencode-go/glm-5.2` is primary for `clawdbot_agent`, `openclawy_agent`, and `moltbot_agent` unless a narrower agent list was requested.
- `qwen3.7-plus` exists as a text+image model for vision work.
- `main-cron` is not modified.
