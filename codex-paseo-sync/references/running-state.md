# Running state / import-mid-turn

Scope: ONE symptom only — the SAME original Codex chat shows Thinking + Stop in Codex Desktop while Paseo shows a completed "Worked for …" footer plus an idle composer, even though messages, tool rows, and timestamps keep updating in Paseo. Import/open/resume mid-turn only. The larger bridge/catalog/native repair stays INCOMPLETE and STOPPED; nothing here reopens it.

## Diagnose (read-only, aggregates only)
Confirm all three before doing anything else: Paseo footer idle on the original handle, Desktop active on that same original chat, and the Paseo adapter subscribed with recovery `active` and no pending/exhausted spike. Report aggregate counts only. Never print handles, transcripts, titles, process identifiers, or settings values.

## Cause
The in-flight turn's native `turn/started` fired before Paseo subscribed, and the clean import/hydration path never re-synthesized it (the reconnect-only `catchUpActiveTurn` was already dedup-seeded, so reconnect never healed it either). Timeline deltas still stream, so content grows while the turn boolean stays idle — true completion is then a no-op on the footer. A stale terminal for an OLD turn id could additionally close the live run at the manager through an unattributed terminal event.

## What the installed fix does (live since 2026-10-20)
- Bridge announces exactly one live `turn/started` on the initial-hydration path, and only for a snapshot turn whose known status is `inProgress` (`terminal()` authority; terminal/missing/unknown never announce), with completed-race and stale-snapshot guards on the shared started-set dedup, before `rememberHistory` seeds. No completions synthesized, no model-turn RPCs.
- Provider retains the externally-started root turn, replays it in the exact live shape to a late subscriber, and suppresses stale id'd terminal EVENTS so the live run stays running; matching completion/failure/cancel still clear normally.
- Timer counts from Paseo attach (`openActiveTurn` stamps the attach time); no historical start time is reconstructed, so the first seconds of elapsed time are attach-relative by design.
- A CLI/server package update can overwrite the provider patch (stock bytes return). The maintained installer beside the live bridge revalidates anchors on demand and refuses unfamiliar, partial, or drifted shapes — it grants no automatic future-version permanence, and no new watcher or task was created. Idempotent dry-run beside the bridge (default settings lookup, no personal paths hardcoded):
  `node "$env:USERPROFILE\.paseo\codex-shared-bridge\install-provider-running-retention.mjs"` — expect installed true, changedFiles 0, no rewrites.

## After activation, expect
Import-mid-turn reaches running with zero further deltas; true completion flips the footer once; a stale old terminal keeps the run open; failed lands error and canceled/interrupted lands idle; foreground-owned, subagent-child, question, and permission behavior unchanged; zero model-turn replays. Never rerun a successful active install, never refresh a busy chat, never force a deferred `deferred_busy` run — wait for a manually verified full idle window first. User verification 2026-10-20: the user opened the actively-working original chat in Paseo and confirmed the running indicator with ticking timer displays correctly (proofMethod: user report; dated, no raw message/session IDs kept). Automated pixel/ticking proof remains unavailable (tool path failure); no automated screenshots or model-turn tests claimed.
