# Repair continuity and durable history

For any future Codex/Paseo continuation, repair, or historical-context request, read this reference FIRST, before ordinary installed-integration diagnosis in `SKILL.md` and the other references. Ordinary setup, inspection, and migration behavior is unchanged.

## Durable history source

- Private repository: `https://github.com/Yousuf59zaman/codex-paseo-sync`.
- Local checkout (when present): `%USERPROFILE%\Projects\codex-paseo-repair`.
- At the current checked-out Git HEAD, repository-root entrypoints are `README.md`, `AGENTS.md`, `docs/current-state.md`, `docs/original-goal.md`, `docs/architecture.md`, `docs/repair-history.md`, `docs/evidence.md`, and `docs/resume.md`. Resolve all paths against the repository root, never the installed skill.
- Read `README.md` plus the latest `docs/current-state.md` and `docs/resume.md` first; `docs/original-goal.md`, `docs/repair-history.md`, `docs/evidence.md`, and `docs/architecture.md` supply the full durable technical context; `AGENTS.md` holds the standing exact pinned-Muse workflow.

## How to use the repository

- Context discovery and read-only retrieval come first, then only work authorized by the current user request and standing rules. Never invent filenames and never claim unverified links exist.
- Recovery through this reference is read-only. When repository access is appropriate, prefer authenticated `gh`/CLI read-only clone, fetch, or `pull --ff-only`.
- Before updating any checkout, inspect origin, `HEAD`/branch, dirty state, and divergence. Never force, reset, overwrite, or merge dirty or divergent trees.
- A missing checkout may be cloned to the named path only under the current request's authority. Otherwise use authenticated read-only GitHub reading.
- This reference performs no Git or network operations itself.

## Evidence discipline

- Distinguish historical snapshots from current observation; accepted source, static code, and tests from deployed or live UI; the latest checkpoint from stale state; `NULL` root/core gates and original obligations from newer claims.
- Add no new requirements and revive no rejected diagnostics.
- Never ask the user to re-explain facts already supplied by the durable documents. Report genuinely unavailable facts honestly.
- Raw private evidence (logs, settings, auth, transcripts, sessions, private bindings) stays recovery-local. Never blindly upload it. The repository holds sanitized technical knowledge and evidence pointers only.

## Standing execution and authorization bounds

- Standing `AGENTS` pinned-Muse executor applies: Codex plans and reviews; substantive execution and drafting go through the exact pinned Muse model. Preserve the explicit user authorization behind this skill update.
- Invocation or context recovery never authorizes automatic live repair, deployment, UI or model turns, auth/history/settings changes, or GitHub publishing.

## Verified inspector lessons (2026-10-09)

- Invoke the inspector with a fresh `pwsh -NoProfile -File` call: this avoids caller `StrictMode` inheritance, including the same-process `&` failure and the failed optional `provider.enabled` read seen at 2026-10-09 13:44 UTC.
- The safe aggregate output still internally reads the full `canonical-history-verify.json` through `Read-LocalJson`: never claim the report body was not locally read.
- Zero catalog counts with null `backendGeneration` on the installed failure path are failure aggregates, not proof of empty chats or of a generation change.
- Preserve inspector bytes: do not patch the installed inspector as part of recovery reading.
- Staged or historical `profile82` and `catalog44` values are not deployment or live-UI proof. Consult the latest repository evidence for the pending chain, root, and core activation state.
