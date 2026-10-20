---
name: skill-manager
description: "Route user requests through installed local Codex skills before acting. Use for broad task triage, automatic skill selection, deciding whether any skill in C:\\Users\\User\\.codex\\skills can make a task safer or better, refreshing the local skill catalog, auditing skill fit, or choosing not to use a skill when no high-confidence match exists. Also handle requests using the former skill name skill-vault."
---

# Skill Manager

## Unified discovery and former vault routing

Use this one entrypoint for skill selection and former Skill Vault workflow lookup. Read [vault routing and layout rules](references/vault-routing.md), [workflow index](references/workflow-index.md) and [layout contract](references/layout-contract.md) when finding saved workflows or maintaining organization. Keep all active skills as independent top-level siblings, not nested child `SKILL.md` files.

For the portable Node router, run `node "<this-skill>/scripts/find-vault-skill.mjs" --query "<name or keywords>" --json`. The retained PowerShell wrapper accepts `-Query` and `-Top`. Exact former names resolve through [the alias map](references/skill-aliases.json) to canonical skills; alias resolution never executes a workflow. The Python catalog retains plugin discovery and `--extra-root` support. Resolve the current agent root from this skill location rather than assuming Codex.

Run `node "<this-skill>/scripts/test-router.mjs"` and `python -B "<this-skill>/scripts/test-catalog.py"` after changing routing. Use `agent-sync` separately only for authorized synchronization. Before a future GitHub pull/merge, consult the alias map and reconcile retired remote folders so the old entrypoints are not reintroduced.

Use this as a quiet router for local skills. Its job is to decide whether another installed skill should guide the task, not to force skill use.

## Routing Workflow

1. Restate the task internally as an intent, artifact type, repo/tool context, and risk level.
2. Check the live local catalog:

```bash
python "$SKILL_DIR/scripts/catalog-skills.py" --root "<current-agent-skills-root>" --query "<user task>"
```

The Python script defaults to the skills root containing this installed copy and retains `%CODEX_HOME%\plugins\cache` discovery. Pass the current agent's root explicitly for cross-agent work. Add `--extra-root <path>` for other custom folders, or `--no-plugin-cache` when plugin skills should be ignored. The Node router resolves exact former names through the alias map and excludes retired entrypoints.

If the catalog may be stale, regenerate it first:

```bash
python "$SKILL_DIR/scripts/catalog-skills.py" --write "$SKILL_DIR/references/skill-catalog.md"
```

3. Use a candidate skill only when the task clearly matches its name or description and the skill adds real value.
4. If no candidate is clearly useful, do the task normally with no skill.
5. If several skills match, use the smallest set that covers the task. Prefer domain skills over this router after routing.

## Confidence Rules

- **High confidence**: the user names the domain/tool/artifact directly, e.g. Vue data flow -> `vue-data-debugger`, PDF layout -> `pdf`, OrangeBD project work -> `orangebd-project`.
- **Medium confidence**: the task shares strong keywords with a skill, but the artifact or repo context should be checked first.
- **Low confidence**: generic coding, explanation, or shell tasks with no strong skill match. Do not force a skill.
- Treat skills with TODO descriptions as low-confidence unless the user explicitly names them or their folder content confirms relevance.

## Safety Rules

- A skill is guidance, not permission. Keep normal safety checks, approval rules, tests, and file-edit discipline.
- In Codex Desktop/Relay AI sessions, deferred plugin tools such as Browser, Chrome, and node_repl must be discovered with `tool_search`, not `list_mcp_resources`. Do not tell the user `mcp__node_repl__js` is unavailable until `tool_search` has been attempted for the needed tool family.
- Do not let routing trigger destructive commands, credential changes, cleanup, sync, auth migration, production deploys, or broad filesystem writes by itself.
- For high-impact skills such as auth sync, OpenClaw updates, agent sync, automation scripts, or Windows startup changes, inspect the skill instructions first and prefer a plan/checklist before changing state.
- Never run a skill script that modifies files or external services just because it is listed as a candidate.
- Preserve user work. Check existing files before edits, avoid overwrites, and keep changes scoped.
- If the user explicitly says not to use skills, obey that request.

## Communication

- Do not ask the user to mention skills manually.
- Do not produce a skill-selection report unless it helps the user or the task requires transparency.
- When the runtime/developer instructions require announcing selected skills, keep it to one short line.
- If no skill is used, do not mention the router.

## Catalog

Read `references/skill-catalog.md` only when script execution is unavailable or when a human-readable list is useful. Treat it as a snapshot, not authority. Regenerate it after installing, removing, or editing skills.

## Maintenance

See [consolidation record](references/consolidation.md) for the former entrypoint and preservation contract.
