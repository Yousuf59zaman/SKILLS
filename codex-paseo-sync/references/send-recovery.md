# send-recovery — Paseo send-timeout/lifecycle diagnosis bounds
Sanitized reference. Counts/categories/booleans only; no bodies, IDs, or logs.

## What this covers
The 55s overall server budget in `handleSendAgentMessageRequest`
(Session → receipt claim → interactive load → provider pre-write checkpoints
→ honest `accepted:false` error strings). All diagnostics below are
read-only unless stated; never resend on ambiguity, never replay a draft.

## Diagnostic bounds (read-only first)
- `send-sync-status.json`: `installed` + `pendingRollout` booleans,
  `changedFiles` count, `lastPatchedAt` moment. Source-only until the
  runtime ack below proves otherwise.
- `send-build.private.json` (runtime ack, written by the daemon-loaded
  provider): helper build + patch version + baked provider const + daemon
  generation + freshness. Activation = ack newer than the install AND bound
  to the live daemon generation. A test-constructed ack never counts.
- `send-fence.private.json` + `send-rollout.json`: outstanding mutation
  vs observed states (`active`, `deferred_busy`, `awaiting_ack`,
  `needs_attention`). A fence means observe, never pile on a second stop.
- Receipt claim files (daemon receipt dir): per messageId —
  `pending` = post-dispatch ambiguity (quarantine, same-ID retries stay
  unknown, never resend); absent = nothing was sent (same-ID retry safe);
  `completed` = accepted (duplicate, no second dispatch).
- Response strings are the whole contract (`accepted` + `error` only):
  "Nothing was sent; safe to retry" vs "confirmation was lost …
  do not resend automatically" vs a concrete failure. No extra fields exist
  on the wire; anything else was stripped or never sent.

## Task Running != fresh (watcher lesson)
A `Running` scheduled task proves a loop process exists, not that work
completes. The catalog watcher once showed a fresh-looking `Running` task
while its worker heartbeat and sync status were ~34min stale: exactly one
watcher-owned installer child (`install-catalog-hook.mjs`, a seconds-long
local script) had hung, blocking the loop with no timeout. Fix applied in
`Start-Catalog.ps1`: every node step runs bounded (60/90/120s); on timeout
only that exact child object is stopped, the whitelisted stage/kind is
recorded in `catalog-worker.private.json` (`lastStep`/`lastStepKind`), and
the loop continues to the next pass under the existing mutex. Recovery rule:
stale heartbeat + exactly-one over-age installer child with a live parent
justifies stopping ONLY that child — never the daemon, native, model,
Desktop, or Paseo processes. After recovery the task restarts the loop with
the bounded script; verify by heartbeat freshness, not task state.

## Activation bounds
`Update-SendSync-WhenIdle.ps1` (per-minute `PaseoCodexSendRollout` task)
reloads the daemon ONLY on double-proven full idle (Codex + Paseo), same
backend generation, same daemon generation, with a durable fence and
generation-bound ack. Busy replies → `deferred_busy`, retried next minute.
Never force switches, never cold chats, never model messages for ack.
Lock discipline (same for the question updater): the full 90s idle proofs
run lock-free before serialization; the shared account/startup mutex is
held only across fast re-proof (10s idle caps, 3s gateway, fast daemon
reads) plus the stop/ensure mutation itself, and every pacing/backoff
wait plus the multi-minute ack observation run outside the guard — a
second process (manual `codex-app`) can always acquire the operation lock
mid-observation (second-process acquisition proven in fixtures).

## Unproved by design
Which exact segment (load / hydrate / turn-start / run-start wait) exceeded
the old 60s window in any single historic incident cannot be recovered from
code or status files; the repair bounds every segment instead. A healthy
lazy catalog (or any fresh status) does not prove sends work — only a live
accepted send or the ack chain above does.

## Native idle proof and send admission (exact contract)
A lost turn/start acknowledgement leaves ambiguity that local state alone
can never retire: cleared local fields, a fulfilled interrupt, a null
activeTurn guess, or absent flags are NOT idle proof. Only fresh exact
native metadata counts, read AFTER the existing lifecycle establishes a
usable current connection and loads ONLY the selected original handle (no
bulk cold-load, no new identity, no model until admitted):
- `thread/loaded/list` must include the exact original thread id.
- `thread/read` with turns excluded must return the same thread id in its
  thread object with an OBJECT status: `idle` proves idle, `active` proves
  a genuine running turn (including Desktop-only turns with null local
  markers). Missing/mismatched identity or any other status shape stays
  unknown — never false idle, never a second start, never an implicit
  interrupt to obtain proof.
- The shared adapter can outlive a backend restart with the same client
  object, so generation is proven by the public local bridge status
  (expected integration, ready state, numeric generation sampled before AND
  after the read), never by pointer comparison or caller assertion.
- Proven idle retires stale LOCAL markers plus the uncertainty and admits
  only a NEW distinct message; the old ambiguous receipt stays quarantined.
  Proven active honors the active-turn policy (no second start). Anything
  else preserves the ambiguity: check the chat, never auto-resend.
- Refusals never clear foreign or fresh state: cleanup is limited to
  synthetic markers provably created and still owned by the refused start
  itself. A lost/null reservation or any state change across the awaited
  turn build refuses dispatch with zero new starts, leaving existing and
  fresh native state intact.
- Stale cached IDs alone never bypass the read: a lost completion
  notification can leave a native turn id plus foreground markers behind
  with no uncertainty recorded while the thread is actually idle. The user
  send still probes real metadata after the lifecycle; fresh exact idle
  with a stable generation retires the stale cached id/markers and admits
  one new start. Any local change mid-probe (including a fresh native
  turn event) invalidates the proof: zero new starts.
- The configured route is the shared bridge, so unreadable metadata also
  rejects FRESH sends before any native write (missing/mismatched
  identity, changed or inaccessible generation, transport failure, or an
  expired probe deadline). A down bridge is still the shared route, never
  a license to guess. One overall probe deadline covers every dependent
  wait with remaining-time limits and aborts the owned status request
  (headers and body together); nothing dangles.
- Every budget-guarded Codex send runs post-lifecycle native admission
  (Desktop protection), including fresh sends without ambiguity: fresh exact
  native idle proof with stable identity+generation admits one new start,
  while unreadable metadata (missing/mismatched identity, changed or
  inaccessible generation, transport failure, expired probe deadline) rejects
  even a fresh send with "could not be verified … check the chat" instead of
  dispatching on a guess. Internal non-send paths perform no admission reads
  at all.
- Activation freshness mirrors the same rule: the live daemon generation
  must be newer than every reviewed component patch moment (all five
  package targets plus the helper), with the exact configured exe/start
  identity, canonical helper hash, baked composed target, and a fresh
  daemon-owned ack. Until the current outer reply finishes, the validated
  idle-only queue stays pending honestly — never forced.

## Terminal popups are separate

A terminal-window question about the per-minute retry task is not send
diagnosis. Follow [terminal-visibility.md](terminal-visibility.md) instead;
its console-free launcher state does not change these send bounds.
