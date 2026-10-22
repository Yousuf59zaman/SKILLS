# Workspace layout — flat (applies only with flag + active load receipt)

> Activated 2026-10-22 (scoped catalog placement only): one owned daemon
> reload, flag on a separate quiet boundary, 16 units with 164 chats
> verified, umbrella removed; accepted metadata proof is same-164 exact
> successor placement with returned-API metadata (201 pre = 191 live +
> 10 archived disk-retained; history not rewritten, no content
> comparison). Broader repair stays STOPPED.

When `catalog-flat-workspaces.json` is enabled and a matching flat load
receipt is active, each Codex umbrella child is its own top-level Paseo
project with its own workspace(s); each workspace keeps only its own
original chats as tabs. Flag off preserves the umbrella grouping
byte-for-byte — but only pre-migration: removing the flag after an active
migration does NOT restore the prior umbrella. Never blind-remap or replay
activation; reversal needs a new scoped review using private backups.
See `catalog.md` (marked LEGACY umbrella flow) for the pre-migration
placement.

- One top-level project per child working directory (an empty child from
  its project root). Hetero-cwd members (agent cwd differing from the
  workspace backing directory) are admitted only by the narrow hook:
  explicit flag AND trusted private
  `mapping.projects[nativePid].flat[cwdKey]` pair naming that exact
  target, with the manifest row, previous-record cwd, busy, lifecycle,
  and identity checks unchanged. No Recents masquerade.
- Preserved per chat: original agent identity, original Codex handle
  (`persistence.sessionId`/`nativeHandle`), real `cwd`, config/title,
  history. No forks, no cold inits, no bulk resumes.
- Unmapped rows are homed by the old-workspace reverse map (retained at
  current placement, never hidden while natively present). Unrelated
  projects, `Recents`, and the sync example group are untouched.
- Future scope is NEW CHATS for EXISTING mapped units only; entirely new
  future projects are NOT auto-created (unit set frozen).
- The umbrella project is removed only after every old workspace is
  archived agent-free with an empty terminal scope, verified fresh at the
  final gate; removal deletes a registry record only, never disk folders.

`flatLayoutHealthy` in the inspector is scope-flat only: flag on, active
fresh status, `flatLayout` + umbrella-removed flags set, fully verified
counts with zero duplicates/deferred, every roster unit exactly matched to
an active project/workspace owner pair, umbrella absent. It never implies
whole native catalog/history repair proof; the broader repair stays
STOPPED and out-of-scope failures stay honest.
