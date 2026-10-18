---
name: skill-vault
description: Read-only index and router for installed sibling skills. Use when Yousuf says Skill Vault, asks to find a saved workflow, or needs the former vault workflows for OpenClaw, FB Second Brain, Office/Basha Commander, Relay AI, AltSnap or taskbar ordering. Locate the matching independent top-level skill by its current name and description, then follow only that skill. Use agent-sync separately for requested agent or GitHub synchronization.
---

# Skill Vault

Use this skill as an index, not as a container for other skills. The former vault workflows now live beside this folder in the current agent's `skills` root.

## Route a request

1. Resolve this skill's actual folder and its parent `skills` directory. Do not hard-code the Codex path when running from Claude, Antigravity, VSCode or OpenCode.
2. Translate the request into a precise English workflow name or 3-8 search keywords when needed. Search the current top-level sibling skill frontmatter:
   ```powershell
   node "<this-skill>\scripts\find-vault-skill.mjs" --query "fb second brain" --json
   ```
   The existing PowerShell entrypoint remains compatible:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "<this-skill>\scripts\find-vault-skill.ps1" -Query "taskbar z order" -Top 5
   ```
3. Read the selected result's full `SKILL.md`; resolve its resources from that result's folder. Load only the smallest relevant set.
4. Treat keyword scores as candidates, not authority or permission. If no result genuinely matches, use the normal approach rather than forcing a skill.
5. Prefer current sibling source over old chat excerpts, archived copies or cached catalogs. See [the workflow index](references/workflow-index.md) for the former vault names and [the layout contract](references/layout-contract.md) before modifying organization.

## Preserve independent discovery

- Install active workflows as `<skills-root>/<skill-name>/SKILL.md` with their complete scripts, references and assets.
- Do not recreate a nested vault or put other `SKILL.md` entrypoints below this skill.
- Keep one authoritative copy of each skill per agent root. Reconcile duplicate content before removing a copy.
- Keep backups outside all active skill roots; a recursive loader may otherwise discover them.
- Use the existing `agent-sync` skills track only when synchronization is requested. A routing request must not trigger installs, moves, syncs or GitHub writes.
- Check external task/launcher dependencies before moving executable resources; preserve running services.
- The scanner reads files only. It does not execute selected workflows, install Python, modify files, or contact a service.

## Verify the router

Run `node "<this-skill>\scripts\test-router.mjs"`. Use `--root <skills-directory>` only to inspect a specific alternate installation. For each agent, verify that results resolve inside that agent's own root.
