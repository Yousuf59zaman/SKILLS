# Controlled skill sync and system-cache boundaries

## Manual operation only

The legacy post-checkout/post-merge/post-commit hooks and SyncSkills.vbs logon copier are retired. They must not be installed again. The .github compatibility scripts perform no sync, pull, startup installation or hidden launch. Use the agent-sync skills track directly: inspect its dry-run and mandatory GitHub comparison, then apply only an explicitly approved scope. Never use a blanket mirror of a dirty skills worktree.

Before changing Git state, inspect effective hooks, including those shared by linked worktrees. The safety helper refuses known legacy auto-sync hooks for mutations without disabling unrelated hooks.

## Consolidated entrypoints

The alias map in the sibling skill-manager/references/skill-aliases.json records retired names. An apply is refused before any sync writes when a retired entrypoint exists in any selected local or GitHub worktree. Back up and manually reconcile that folder into its canonical sibling; never silently discard it, reimport it or change aliases to bypass the guard. Run dry-run again after reconciliation.

## System skills

Do not synchronize .system or .codex-system-skills.marker across agents. Codex owns its embedded skill cache and marker; the marker fingerprints the binary's embedded bundle, not the current folder contents. Do not fabricate a fingerprint or run Codex against another agent's home to regenerate it: the installer may replace that entire .system directory. Archive a mistakenly copied marker outside active roots after backup; preserve all actual system skill files.

## Verification

Run node scripts/test-sync-safety.mjs. Run the existing skill-manager router/catalog and synthetic auth tests after organization changes. Verify hashes, absence of retired entrypoints, and that unrelated files and Git staged changes were preserved. Test legacy compatibility scripts only with disposable homes or read-only invocation. Do not test this repair by executing live account switches or restarting services.
