# Bidirectional project/workspace removal — forward converged once (53m33); correction installed, UI latency unverified

> Status 2026-10-22 (converged once). The 7 reviewed sources are LIVE, flag ON. The owner
> normal Codex RemoveProject on the empty test target converged naturally after 53m33:
> 1 CONFIRMED receipt + 1 CONFIRMED tombstone + 1 retained INTENT fence (exact test pair),
> observed after the Codex native record/pending disappeared. Catalog 164/164 verified,
> dup 0, across 3 natural passes (20 projects). Folder preserved empty and intact; workspace
> archived, parent removed. Timing delay UNRESOLVED; correction INSTALLED, flag ON
> (3 OFF + 3 ON healthy); new positive UI latency UNVERIFIED. Generation stable. Baseline 16 pairs incl test target + 5 DISTINCT unknown
> held (10 raw rows). Installed: original 7 now four updated + 3 unchanged (all-11
> backup verified, flag ON); three OFF + three ON healthy natural passes observed
> (20 projects, 164/164, dup 0, generation stable). Reverse remains BLOCKED;
> no full bidirectional removal is claimed.
> Creation stays COMPLETE for its creation-only scope ([project-creation.md](project-creation.md));
> the broad old repair stays STOPPED ([repair-continuity.md](repair-continuity.md)).

## Request scope (removal ONLY)

- User requests removal sync BOTH ways: a removed Codex project removes its mirrored
  Paseo project/workspace, and a removed mirrored Paseo project/workspace removes the
  corresponding Codex entry. Metadata removal only; chats/history and files preserved.
- Rename is excluded. No new framework; old-repair resume is not authorized.

## Current status

- Forward (Codex Remove -> Paseo) tracking is ENABLED, prospective, event-observed only,
  respecting the ordinary Codex Undo window. The empty test target converged naturally
  once: local gone, pending consumed without restore, native row gone, Paseo workspace
  archived (registry `archivedAt`) + parent project removed, 0 agents / 0 terminals,
  folder preserved empty, 164/164 user chats intact across 3 natural passes (20 projects,
  dup 0). No restarts initiated by this verification/unit. The 53m33 UI proof used the
  OLD source and stands separate; the new source's 118 pass plus deployment/natural
  health is not new live-UI timing.
- Timing delay UNRESOLVED (53m33 owner-action to confirmed); the correction is INSTALLED
  and new positive UI latency is UNVERIFIED. Recorded owner test already done — DO NOT ask
  to repeat THAT test.
- Watcher baseline is PROSPECTIVE: initial ON snapshot 15 exact pairs, current 16 pairs
  incl 1 empty test target (a throwaway target, not a new normal project claim); 5 DISTINCT
  unknown HELD — 10 historical unknown rows represent 5 keys, not 10 projects, never
   tombstoned retrospectively, no metadata rewrite. CONFIRMED receipt (1), CONFIRMED
   tombstone (1), and retained INTENT fence (1) for the exact test pair only (corrected
   from the earlier all-zero snapshot); all other-key counts 0.
- Accepted positive authority (new route — all conditions required, no relaxation):
  app-owned by-host removal intent beyond the real 60s Undo + intact-pair baseline +
  at least 3 fresh stable post-expiry observations + strict identity + fresh
   both-mutation checks. The native row may remain; the old native-absence branch is
   retained. Busy/running, unknown/incomplete, Paseo-owned-or-unknown worktree,
   late-child, and replay cases still defer — never relaxed (only proven-non-owned
   proceeds).
- UI convergence observed exactly once (53m33); timing unresolved, correction installed,
  new UI latency unverified — one convergence is not a standing proof. The Root inspector confirmed
  the 4 old warnings remain. No workarounds ever (restarts, raw global-state edits,
  native-only delete). Original files/chats are preserved throughout.
- Reverse (Paseo delete -> Codex) is BLOCKED on technical grounds: the current pinned
  Store release (`26.1016.6573.0`) has no supported external Codex remove route, and a
  Windows UI deletion fallback cannot run unattended in the established silent workflow —
  installed ComputerUse confirmations require "Blocking confirmation required immediately before the action" for local deletion via app interface.
  No headless route exists and per-action UI confirmation is required, so there is no silent
  GUI workaround. No policy relaxation and no UI automation is attempted: no private-IPC
  use, app patch, raw-state edit, native-only delete, or restart workaround. Owner-operated
  UI remains the available manual route; this does NOT request repeating the current target.

## Verification record

- Source acceptance: own 35/0 + independent actual 10/10 (final logs, exit 0, all-no-drift);
  bundled reproduction 45/0 via `run-tests.mjs` (sandbox + synthetic temp settings).
  Independent final 118/118 accepted:
  [project-removal-positive-20261022](https://github.com/Yousuf59zaman/codex-paseo-sync/tree/main/artifacts/catalog/project-removal-positive-20261022)
  (new 22-file positive bundle; `run-tests.mjs` 118/0 reproduced privately).
  Existing artifact technical source unchanged.
- Reproducible runner (not activation): [project-removal-20261022](https://github.com/Yousuf59zaman/codex-paseo-sync/tree/main/artifacts/catalog/project-removal-20261022)
  (`run-tests.mjs`; pins in `MANIFEST.md`) — the separate ORIGINAL-source 45/0 proof;
  the 53m33 UI timing belongs to that old source, not to the new bundle.
- The test target naturally registered native; convergence observed once as above
  (53m33, timing unresolved; correction installed, new UI latency unverified).

## Desktop removal semantics (pinned Store release, honest boundary)

- The app has an INTERNAL renderer IPC `removeLocal` path that performs the full
  app-owned sequence (threads to projectless, staged pending deletion with absolute
  deadline, local row delete + flush, order/pin filter, ~60s Undo clone, native
  `project/delete` after Undo expiry). Disk and chats are preserved.
- There is NO supported EXTERNAL invocation of that path: no client/CLI flag, no
  deep-link, no headless entry point. Do not mistake the internal IPC's existence for
  an externally callable remover, and do not work around it with UI automation, raw
  state edits, native-only delete, app patching, or restarts.
- LOCAL-gone + NATIVE-present inside the Undo window is normal, not drift.
  Native-only `project/delete` alone does not prove sidebar removal.

## Guards (old route qualified below; new route states its own conditions, none relaxed)

- OLD route only — event-observed, never headless-invoked; stable triple-absence past
  BOTH the staged deadline and the Undo expiry, with generation/epoch unchanged and idle.
  (Classic native-absence branch, retained.)
- Pending/unknown receipts are observe-only with no retry; exact-ID tombstones only,
  never a directory-wide or permanent block; no resurrection of removed pairs.
- Shared projects/workspace bindings are workspace-scoped; canonical collisions defer.
- Busy/running replies, non-quiescent terminals, and incomplete enumeration all defer.
- Archive/remove defer on Paseo-OWNED or UNKNOWN worktrees (only proven-non-owned
  proceeds); filesystem preserved; never hard-delete chats.

## Recovery and routing

- Private recovery location only:
  `%USERPROFILE%\.codex\tmp\paseo-project-deletion-20261022\documentation-c\checkpoint.md`
  (read-only recovery; verify current files/worker state before acting).
- Skill routing: creation questions use [project-creation.md](project-creation.md);
  continuation/repair/history questions use [repair-continuity.md](repair-continuity.md);
  layout questions use [workspace-layout.md](workspace-layout.md).
  The old broader repair STOP remains authoritative.
