# Bidirectional project/workspace creation — COMPLETE for creation-only scope

> Status 2026-10-22. Feature ENABLED and both directions passed live, including the
> late-consent self-heal (deterministic, idempotent re-runs, no manual map writes, no
> relaunch). No second trust ask. Nothing here authorizes restarts or broader repair,
> which stays STOPPED. No model-turn or live-response claims are made.

## Scope (creation ONLY)

- New Codex project -> its own top-level Paseo project/workspace. New Paseo workspace ->
  its corresponding Codex project. Each side keeps only its own original chats; no duplicates.
- The closed flat migration stays closed; future bidirectional units are NOT frozen (the
  unit-set freeze in [workspace-layout.md](workspace-layout.md) covers the old migration only).
- Archived threads stay excluded; archived restores are ignored. No deletion or rename
  propagation. No new framework.
- Newer removal request handled separately in [project-removal.md](project-removal.md)
  (forward converged once 53m33, timing unresolved, reverse BLOCKED);
  the no-deletion phrase above is historical creation-scope evidence. This creation
  record is otherwise unchanged.

## Authority and naming

- Codex project membership and chat names remain authoritative.
- Desktop names a route-created local project after its root folder. A reverse custom Paseo
  title may therefore differ from the Desktop name. Report actual vs requested names;
  never rename an existing project to force a match.

## Trust and idempotency

- A first-time folder needs the standard Codex folder-consent user action; never automate,
  approve, or bypass it. Only the currently pinned Store release is proven — other updates
  defer to a fresh review.
- An unknown-timeout handoff is observe-only: re-read the local cache and the native
  listing on later passes, never issue a second GUI launch for the same receipt. A durable
  per-key pending receipt guards the single handoff.
- Native idempotency rides Desktop local root matching plus the one-issued receipt — never
  invent a separate native key, and never call native `project/create` before the Desktop
  route (the route creates the native row internally; a separate call would duplicate).

## Deployment and live status (complete for creation-only scope)

- Source-only drop-in modules, picked up through the existing watcher hot path; no
  daemon/backend restart, no auth/config changes.
- Forward live pass: one native project created once via API; the natural watcher created
  its own Paseo project and workspace. Root independently verified the exact flat pair
  plus the future unit; catalog status active (17 managed / 164 chats / 164 verified /
  0 duplicates / 0 deferred, 1 bidirectional managed unit). Baseline counts observed:
  18 native / 17 local projects, 71 workspace IDs, 25 union project IDs (19 live
  projects); frozen 16 unchanged. Gateway generation/epoch unchanged across the pass.
- Reverse: user approved the fresh folder trust (no further approval needed, never ask
  again); Desktop project created and present; native+local unique, reverse-top receipt
  confirmed, bidirectional unit flat-proven. The late-consent race (NULL placeholder
  created during forward apply while consent completed between passes) is fixed by
  runtime+catalog natural self-heal: receipt revalidates the pair, forward superseded,
  phase cleared — deterministic and idempotent, no manual map write, no relaunch.
  Verified status: active, 18 managed / 164 chats / 164 verified / 0 duplicates /
  0 deferred, syncing pending 0, 2 bidirectional managed units; gateway epoch and
  generation unchanged; no new GUI spawn since the approved handoff.
  The earlier manual route proof stands separately from this natural reverse.
- First-time folders need the standard Codex trust owner action; tested on the pinned
  Store release, newer versions defer for review. A reverse basename may differ from a
  custom Paseo title — report actual vs requested, never rename, no delete propagation.
- New future recovery for this feature can resume; the broad old repair stays STOPPED.
