---
name: skill-vault
description: Parent router skill for a private nested skill vault. Use when Yousuf says Skill-Vault, skill vault, vault skill, or asks Codex to choose a matching stored workflow, including Basha Commander Custom GPT agentic bridge updates, direct OpenClaw OpenCode Go setup, task-based model routing, capability-safe fallbacks, OpenCode Go cooldown bypass, default-first auth-profile rotation, AltSnap window resizing, persistent OpenClaw gateway terminals/watchdogs, Windows taskbar Z-order, or Relay AI and Claude Go setup.
---

# Skill Vault

Use this as a parent router for nested skills stored under:

```text
C:\Users\User\.codex\skills\skill-vault\vault
```

Do not assume every nested skill is relevant. Select the smallest matching child skill set for the user's task, then use only those child skill instructions and bundled resources.

## Routing Workflow

1. Convert the user's request into 3-8 search terms.
2. Scan nested child skills under `vault/*/SKILL.md`.
3. Prefer matching against each child skill's YAML `name` and `description`.
4. If several children match, read only the top candidates' full `SKILL.md` files and choose the best fit.
5. Execute the task by following the selected child skill's instructions. Resolve relative child resources from that child skill folder.
6. If no child skill matches, say that Skill Vault has no matching child skill and continue with the best normal approach.

Use the bundled scanner for a fast first pass:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\skill-vault\scripts\find-vault-skill.ps1" -Query "<user request>"
```

## Child Skill Layout

Add each child skill as a complete folder:

```text
skill-vault/
  vault/
    child-skill-name/
      SKILL.md
      agents/openai.yaml
      scripts/
      references/
      assets/
```

Only `SKILL.md` is required. Optional folders can be present when the child skill needs them.

## Current Child Skills

- `taskbar-zorder`: Diagnose and control Windows taskbar Z-order so normal app windows can cover or stay above the taskbar/footer. Use for `Shell_TrayWnd`, `Shell_SecondaryTrayWnd`, taskbar topmost state, app-over-taskbar behavior, the persistent `KeepTaskbarLowered` watcher, duplicate watcher prevention, and current-user logon autostart.
- `setup-relay-ai-claude-go`: Install, repair, and verify Relay AI 0.4.0 with signed Claude Desktop, secure OpenCode Go credential rotation, live Go favorites, and Relay/Codex configuration on Windows.
- `setup-openclaw-opencode-go`: Keep OpenClaw on direct OpenCode Go, set the three user agents to GLM-5.2, and keep `main-cron` separately on MiniMax M3.
- `route-openclaw-models-by-task`: Route coding, visual/tool, planning/review/security, documentation, video, and cron work to the requested task-specific models.
- `fallback-openclaw-models-by-capability`: Preserve image, video, tool, coding, and reasoning capabilities while falling back within the approved model set.
- `bypass-opencode-go-cooldown`: Prevent one transient OpenCode Go failure from suspending the entire provider while still surfacing upstream limits.
- `rotate-opencode-go-auth-profiles`: Prefer the default OpenCode Go profile and alternate fallback profiles only after provider/auth/transient failures; exclude `main-cron`.
- `setup-windows-altsnap-resizer`: Install and verify AltSnap, its force-resize settings, controls, and Windows Startup shortcut.
- `persist-openclaw-gateway`: Keep status and live-log terminals persistent and make supervisor/watchdog health include enabled Telegram workers, not only the gateway port.
- `update-basha-commander-agentic-gpt`: Update the Basha Commander Custom GPT in Chrome with Codex-style agentic bridge behavior, verify enabled capabilities, handle the 8000-character save limit, smoke-test bridge execution, confirm no Allow/Deny prompt, and verify audit-log success.

## Guardrails

- Do not load all child skill bodies when many exist. Scan frontmatter first, then load only the matching child skill.
- Do not copy or modify a child skill unless the user asks to add, update, or remove a vault skill.
- For child scripts, run them from the child skill folder or use their absolute path.
- If the chosen child skill performs live system changes, explain the effect and restore path when appropriate.
