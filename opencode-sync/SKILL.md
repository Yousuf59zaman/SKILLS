---
name: opencode-sync
description: Repair OpenCode Go authentication and availability in OpenCode CLI, OpenCode Desktop, and Paseo, including expired API keys, 401 errors, CLI updates, and Console authorization. Also sync OpenCode Go model/tool routing for Codex Desktop/Relay AI and OpenClaw when requested.
---

# OpenCode Sync

Use this skill for direct OpenCode Go recovery and for requested routing changes across Codex Desktop/Relay AI and OpenClaw.

## Choose the requested workflow

- For an expired key, `401`, an active subscription that cannot reply, CLI updates/authorization, Paseo provider availability, or a Desktop-only failure, read [references/opencode-go-auth-recovery.md](references/opencode-go-auth-recovery.md). Start there instead of running the routing audit below.
- For Codex/Relay or OpenClaw model/tool routing, use the existing script workflow below and [references/opencode-routing.md](references/opencode-routing.md).

The bundled audit/apply script repairs routing; it does not perform Console sign-in or prove that an OpenCode Desktop composer can reply. Authentication recovery preserves the user's selected models and unrelated configurations. The default-model guidance below applies to requested routing changes.

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
node "$SKILL_DIR/scripts/opencode-sync.mjs" --default-model glm-5.2 --vision-model qwen3.7-plus --agents clawdbot_agent,openclawy_agent,moltbot_agent,molty-59 --apply
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

- `opencode-go/glm-5.2` is primary for `clawdbot_agent`, `openclawy_agent`, `moltbot_agent`, and `molty-59` unless a narrower agent list was requested.
- `qwen3.7-plus` exists as a text+image model for vision work.
- `main-cron` is not modified.
