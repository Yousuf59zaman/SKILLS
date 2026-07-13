---
name: setup-relay-ai-claude-go
description: Install, repair, migrate, and verify Relay AI 0.4.0 with Claude Desktop and OpenCode Go on Windows. Use when Yousuf asks to reproduce the Relay/Claude setup on another laptop, reinstall Claude Desktop, rotate a limited OpenCode Go key in Windows Credential Manager, remove legacy Relay credentials, refresh the Go catalog, expose all Go models through Favorites Catalog, set glm-5.2 as default and qwen3.7-plus for vision, repair Relay/Codex js_repl or app-model catalogs, or diagnose the Windows multi-word Codex prompt bug.
---

# Relay AI + Claude Desktop + OpenCode Go

Orchestrate the complete Windows setup while preserving the Claude profile and keeping secrets out of files, environment variables, logs, and reports.

## Non-negotiable policy

- Keep Relay AI pinned to `0.4.0` unless the user explicitly requests another version.
- Install Claude Desktop only from Anthropic's official Windows download and require a valid `Anthropic, PBC` signature.
- Preserve `%APPDATA%\Claude`. Remove legacy Squirrel files only after the replacement package and UI are verified.
- Store the OpenCode key only in Windows keyring service `relay-ai`, account `global:opencode`.
- Never print, echo, hash-display, persist, or place an API key in command arguments.
- Use `glm-5.2` as the text/coding default and `qwen3.7-plus` as the vision model.
- Do not modify OpenClaw, `main-cron`, Codex OAuth, codex-multi-auth, or unrelated providers.

## Workflow

1. Read [references/windows-setup.md](references/windows-setup.md). Read [references/codex-repair.md](references/codex-repair.md) only when Codex/app-catalog repair is in scope or the Windows prompt test fails.
2. Audit without mutation:

```powershell
$skill = "$env:USERPROFILE\.codex\skills\skill-vault\vault\setup-relay-ai-claude-go"
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\audit-relay-claude-go.ps1"
```

3. Install or verify Node, Codex CLI, Relay AI `0.4.0`, and signed Claude Desktop using the reference workflow.
4. Rotate the OpenCode key with a hidden prompt. This writes the new global credential but retains legacy slots until live verification succeeds:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\manage-opencode-go-credential.ps1" -Action Set
relay-ai providers refresh-models go
```

5. Only after refresh succeeds, remove legacy keyring slots and persistent environment overrides:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\manage-opencode-go-credential.ps1" -Action Cleanup
```

6. Preview, then apply favorites from the live Go catalog. Stop rather than truncate if more than 20 models exist:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\sync-go-favorites.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\sync-go-favorites.ps1" -Apply
```

7. Use the sibling `opencode-sync` skill for Codex repair. Audit before apply, validate its generated catalog, and run the multi-word prompt gate from `references/codex-repair.md`.
8. Fully quit directly launched Claude, then start an interactive Relay session:

```powershell
relay-ai claude-app
```

Choose `⭐ Favorites Catalog`, then start with `glm-5.2`. Keep the terminal open. Choosing `OpenCode Go` directly intentionally exposes only the one selected model.
9. Verify `relay-ai ui`, the Claude model dropdown, `qwen3.7-plus` vision availability, and a live response. Do not claim visual success without inspecting the UI.

## Recovery

After an interrupted desktop session, restore the temporary Claude overlay:

```powershell
relay-ai claude-app --restore
```

Keep timestamped config backups until version, credential, catalog, UI, and live-request checks pass.

