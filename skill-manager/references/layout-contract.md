# Layout and migration contract

## Active layout

```text
skills/
  skill-manager/
    SKILL.md
    scripts/find-vault-skill.mjs
    scripts/find-vault-skill.ps1
    scripts/test-router.mjs
    references/
    agents/openai.yaml
  fb-second-brain/SKILL.md
  taskbar-zorder/SKILL.md
  setup-relay-ai-claude-go/SKILL.md
  ...other independent skill folders...
```

The 2026-10-18 migration moves twelve unique workflows out of the former thirteen-child vault. `taskbar-zorder` already existed at top level; its duplicate differs only by the example folder path and must not become a second installed copy.

## Safe maintenance

- Determine the parent directory relative to this installed skill. All five supported agent roots can differ.
- Copy a whole skill folder, not only `SKILL.md`; preserve relative resources and imports.
- Compare hashes and review same-name content differences before choosing a canonical version.
- Fix references to old locations, and inspect scheduled task actions, startup shortcuts and running command lines. Change only the relevant path and preserve triggers, privileges and running instances.
- A long-running PowerShell watcher may retain its original command line until the next normal sign-in/restart. Do not restart it merely to make that string match; status/duplicate detection must recognize that transitional instance.
- Preserve distinct OpenClaw workspace installations and their real runtime paths. Agent skill reorganization is not permission to redeploy OpenClaw or rewrite its configuration.
- Back up outside the active roots, including task XML before editing an action. Record pre/post hashes and the precise changed paths for rollback.
- Pull the repository's current `main` into a clean worktree before a scoped publish. Do not reset/stash other dirty worktrees automatically. Preserve unrelated differences; never force-push.
- Run the existing Agent Sync skills track and verify every migrated folder across the five roots. Do not change MCP/CLI settings for a folder-only migration.

## Router checks

The bundled tests cover sibling discovery, nested/hidden exclusion, exact-name ranking, no-match behavior, alternate roots, multiline frontmatter and invalid query limits. Run the actual PowerShell wrapper as well on Windows. This tests the router; it does not prove every selected workflow's external services work.

## Consolidation (2026-10-21)

Seven approved pairs now each have one canonical entrypoint. Preserve scripts and references inside that entrypoint; keep retired directories only in backups outside active roots. Historical process-identification paths, such as the pre-migration taskbar watcher path, are intentionally retained for detection and must not be blindly rewritten. Local consolidation is not permission to push GitHub or alter auth, running services, MCP, CLI or startup settings.
