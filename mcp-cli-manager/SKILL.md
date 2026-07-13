---
name: mcp-cli-manager
description: Route user requests through installed MCP servers and CLI tools before acting. Use for broad task triage, automatic MCP/CLI selection, deciding whether a configured MCP server or installed command can make a task faster, safer, more accurate, or more verifiable, and choosing no tool when no high-confidence fit exists. Use when tasks may benefit from browser/devtools inspection, local web UI testing, GitHub/repo work, documentation/context lookup, web crawling, Sentry/error investigation, database/SQL access, git/package/build/test/deploy commands, Docker/Kubernetes/IaC commands, JSON/text search, or installed developer CLIs.
---

# MCP/CLI Manager

Use this as a quiet router for local MCP servers and CLI commands. Its job is to decide whether a tool should help the task, not to force tool use.

## Routing Workflow

1. Restate the task internally as intent, artifact/repo/service context, needed evidence, and risk level.
2. Check the live MCP/CLI catalog when the best tool is not obvious:

```bash
node "$SKILL_DIR/scripts/catalog-mcp-cli.mjs" --query "<user task>"
```

The script combines the maintained known-tool list with dynamic discovery. It includes configured Codex and OpenClaw MCP servers even when they are not in the known list, detects exact CLI command names mentioned in the task when they exist on PATH, and detects package scripts from the current repo via `--cwd <path>`.

If the catalog may be stale, regenerate it first:

```bash
node "$SKILL_DIR/scripts/catalog-mcp-cli.mjs" --write "$SKILL_DIR/references/tool-catalog.md"
```

3. Use a tool only when it adds real value: better evidence, safer execution, deterministic validation, current local state, or access to a system the model cannot know from memory.
4. If no candidate is clearly useful, do the task normally with no MCP/CLI tool.
5. If several candidates match, use the smallest set that covers the task. Prefer read-only inspection before write actions.

## Selection Rules

- Prefer MCP when structured/session-aware access matters: Chrome/DevTools, Playwright browser control, GitHub MCP, Context7 docs, Firecrawl, Sentry, or MCP Toolbox database access.
- Prefer CLI when local deterministic execution matters: `rg`, `git`, package managers, test runners, `docker`, `kubectl`, `helm`, `terraform`, `gh`, `jq`, `pnpm`, `uv`, deploy CLIs, or project scripts.
- Prefer the repo's own scripts and lockfile package manager before global tools.
- Prefer exact local evidence over assumptions: inspect files, run narrow searches, run targeted tests, then broaden only when needed.
- Prefer dry-run/status/list/validate commands before commands that write, deploy, delete, migrate, or change auth.
- For read-only inspection tasks, do not create helper scripts or temporary files just to run a check. Use inline shell commands, MCP read/list calls, or existing project scripts.

## Safety Rules

- Do not use a tool just because it exists. The task must benefit from it.
- Do not run destructive commands, production deploys, database writes/migrations, credential changes, global config rewrites, force pushes, or broad cleanup unless the user explicitly asked for that class of action.
- Do not write secrets into config files. Use environment variables or ask the user to authenticate when a service requires credentials.
- Treat MCP servers as access channels, not permission grants. Keep normal file, git, network, and approval discipline.
- For GitHub, Sentry, Vercel, Supabase, Kubernetes, Terraform, and Docker operations, start with read-only status/list/plan commands unless the user clearly requested an apply/deploy/change.
- For Chrome/DevTools/browser tools, interact only with pages relevant to the task.
- If the user asks for a read/list/check-only result, avoid `write`/edit tools entirely unless the user explicitly approves creating an artifact.
- If a tool is missing or unauthenticated, either use the best safe fallback or state the missing auth/tool briefly.

## Common Routing

- Frontend UI, localhost, console/network/performance, screenshots: Chrome DevTools MCP or Playwright MCP.
- Library/API/framework docs: Context7 MCP; fallback to official docs when required.
- GitHub issues, PRs, Actions, releases, repo metadata: GitHub MCP or `gh`.
- Repo search and code navigation: `rg`, `git`, language/package tooling.
- Test/build/package tasks: project scripts, `pnpm`, `npm`, `uv`, Python tooling, or framework CLIs.
- Web extraction/crawling: Firecrawl MCP or Firecrawl CLI when normal browsing is not enough.
- Sentry errors or production stack traces: Sentry MCP.
- SQL/database inspection: MCP Toolbox for safe local SQLite by default; use project DB CLIs only with clear context.
- Containers/Kubernetes/IaC: `docker`, `kubectl`, `helm`, `terraform`; prefer status/plan first.
- JSON filtering/transforming: `jq`.
- Deploy/provider workflows: `vercel`, `supabase`, `gh`, or provider-specific project scripts; avoid deploy/apply unless requested.

## Communication

- Do not ask Yousuf to mention tools manually.
- Do not produce a tool-selection report unless it helps the task or the user asks.
- When runtime instructions require announcing selected skills/tools, keep it to one short line.
- Relay important command results in the final answer because the user may not see raw terminal output.

## Catalog

Read `references/tool-catalog.md` only when script execution is unavailable or a human-readable list is useful. Treat it as a snapshot, not authority. Regenerate it after installing, removing, or editing MCP/CLI tools.
