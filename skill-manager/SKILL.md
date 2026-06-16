---
name: skill-manager
description: Route user requests through installed local Codex skills before acting. Use for broad task triage, automatic skill selection, deciding whether any skill in C:\Users\This pc\.codex\skills can make a task safer or better, refreshing the local skill catalog, auditing skill fit, or choosing not to use a skill when no high-confidence match exists.
---

# Skill Manager

Use this as a quiet router for local skills. Its job is to decide whether another installed skill should guide the task, not to force skill use.

## Routing Workflow

1. Restate the task internally as an intent, artifact type, repo/tool context, and risk level.
2. Check the live local catalog:

```bash
python "$SKILL_DIR/scripts/catalog-skills.py" --query "<user task>"
```

The script scans `%CODEX_HOME%\skills` plus `%CODEX_HOME%\plugins\cache` by default, so newly installed user/system/plugin skills can be discovered without editing this skill. Add `--extra-root <path>` for any future custom skills folder, or `--no-plugin-cache` only when plugin skills should be ignored.

If the catalog may be stale, regenerate it first:

```bash
python "$SKILL_DIR/scripts/catalog-skills.py" --write "$SKILL_DIR/references/skill-catalog.md"
```

3. Use a candidate skill only when the task clearly matches its name or description and the skill adds real value.
4. If no candidate is clearly useful, do the task normally with no skill.
5. If several skills match, use the smallest set that covers the task. Prefer domain skills over this router after routing.

## Confidence Rules

- **High confidence**: the user names the domain/tool/artifact directly, e.g. Vue data flow -> `vue-data-debugger`, PDF layout -> `pdf`, OrangeBD project work -> `orangebd-workflow` or `orangebd-project`.
- **Medium confidence**: the task shares strong keywords with a skill, but the artifact or repo context should be checked first.
- **Low confidence**: generic coding, explanation, or shell tasks with no strong skill match. Do not force a skill.
- Treat skills with TODO descriptions as low-confidence unless the user explicitly names them or their folder content confirms relevance.

## Safety Rules

- A skill is guidance, not permission. Keep normal safety checks, approval rules, tests, and file-edit discipline.
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
