# FB Second Brain queue contract

The queue root is `C:\Users\User\.openclaw\workspace\.queue\fb-second-brain`.

## Scripted cron runner

Routine cron execution uses one command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\run-scripted-messenger-queue.ps1
```

Use `-Preflight` to start the managed profile, open one disposable Messenger tab, verify the visible login/PIN state, and validate the queue contract without acquiring the lock, claiming a job, or sending. An encrypted store is accessed only when the corresponding login/PIN form is actually visible. The owned tab is closed before the wrapper exits. The wrapper is an audited automation of the contract below; direct queue-worker commands remain for tests and manual recovery.

- `pending/`: ready or backoff-delayed jobs
- `processing/`: the one job currently claimed by the lock owner
- `failed/`: exhausted retries OR uncertain/partial delivery; retain every payload for inspection
- `payloads/<job-id>/`: durable copies of Telegram attachments
- `events.jsonl`: append-only queue audit events
- `worker-lock.json`: exclusive worker lease; stale locks are recovered

Run all commands from the OpenClaw workspace. The script prints JSON.

```powershell
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs status
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs begin-run --owner main-cron
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs claim-next --lock-token <token>
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs mark-submit-started --lock-token <token> --job-id <id>
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs complete --input C:\temporary\observed-full-bundle-receipt.json
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs fail --lock-token <token> --job-id <id> --error "Concise failure reason"
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs end-run --lock-token <token>
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs retry-failed --queue-number <N> --browser-profile openclaw
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs reconcile-failed --input C:\temporary\independently-verified-reconciliation.json
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs invalidate-orphaned-enqueue --input C:\temporary\verified-stale-cross-turn-orphan.json
```

## Posting rules

- Use only the OpenClaw-owned browser profile `openclaw`; do not use `chrome`, an extension relay, a separately launched browser, cookies, or extracted credentials. Each run owns one disposable Messenger tab by exact target ID, while bundled Playwright attaches over CDP only to that tab inside the existing OpenClaw-owned context.
- Before claiming a job, open Messenger and run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\messenger-login-helper.ps1 -Action Login -BrowserProfile openclaw -TargetId <owned-tab-id>`. The helper first verifies visible Messenger state and may use only the local Windows-user-bound encrypted store when a complete login form is actually visible. It must never print or return the raw login.
- If the helper returns `two_factor_required`, leave every job pending, release the lock, stop the run, and return exactly `Messenger login needs 2-step verification. Queue retained; please complete it in the openclaw browser.`
- Rebuild the cached `post_manifest` from the durable job payload during each claim. Use that refreshed `post_manifest.browser_handoff` as the exact target, attachments, message, and verification cue; a stale cached path is never authoritative.
- Take a fresh snapshot before each browser action. Refs expire after navigation, search, send, modal changes, and uploads.
- If a Messenger chat-history PIN prompt appears, run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\messenger-pin-helper.ps1 -Action Submit -BrowserProfile openclaw -TargetId <owned-tab-id>` and continue only when it reports verified success. The encrypted PIN is not read when no PIN prompt is visible. Never print, retrieve, copy, log, or ask Yousuf for the raw PIN.
- An unreadable login/PIN encrypted store, unverified login/PIN submission, ambiguous group match, missing attachment, upload failure, or unverified send is a failure, never a completion. A 2-step challenge is a global preflight stop, not a job failure: do not claim or increment any job attempt. Never guess or enter a 2-step code and never use a destructive no-restore flow.
- Require the exact target group's `Write to <group>` composer. A generic contenteditable or a different conversation is a safe failure before submission.
- One inbound album/drop is one queue item. The schema-3 bundle seals every ordered attachment's size/hash, all URLs, and the full public text digest. Incomplete Telegram downloads do not dispatch a partial album. Unrelated turns are never combined.
- Do not overwrite an existing draft. Stage ALL attachments at once, require the exact file names/sizes/count and ready upload previews, verify the complete composer text, then persist `mark-submit-started` before clicking the enabled exact Send control exactly once.
- A visible composer is not proof that history has loaded. Require stable structural history for three seconds within a bounded pre-Send check, then freeze the last observed row as the boundary. Older rows hydrating above it are not new delivery; a missing/ambiguous boundary or incoming message interleaved after it fails closed. Link-only jobs must work without any file input. Same-host Facebook reel/photo/link previews are not uploaded attachments; stable Messenger attachment identities, not expiring CDN signatures, bind uploaded media across reloads.
- If a sent link remains in optimistic-only markup, a bounded read-only reload may expose its normal message article. It must then pass the full new-bundle comparison against the frozen pre-Send boundary AND survive a second full reload before completion. This is observation, never a second Send. Message-body identity excludes changing accessibility narration and preview metadata. Failure diagnostics may store only explicitly allowlisted reason classes, counts and booleans, never page text, URLs, identifiers or credentials.
- Call `complete` only after fresh observations prove ALL expected attachments and the COMPLETE text/links in the same outgoing conversation, an empty composer, and either an actual Sent/Delivered/Seen acknowledgement or—only when Messenger omits that label—the exact structurally complete outgoing row keys surviving one full server-backed page reload in the exact conversation. The narrator label “You sent”, an optimistic row that disappears after reload, a moved thumbnail, one image, or absence of progress is not sufficient.
- The scripted sender supplies `delivery_receipt` with `version`, `bundle_fingerprint`, `target_group`, `attachment_count`, `message_text_sha256`, `link_count`, `all_parts_verified`, and `composer_empty`. These must match the sealed bundle. Never fabricate a receipt merely to clear a queue item. A boolean verification note alone is rejected.
- A pre-submit failure follows normal queue backoff. A click failure or missing/ambiguous post-submit evidence is non-retryable manual review because the external side effect may already have occurred; never replay it automatically.
- `reconcile-failed` is a controlled recovery for an already-sent uncertain job, not a retry. It requires the durable Send marker, `delivery_uncertain: true`, independent full-reload persistence proof, the exact `server_reload_persistence` method, and a full receipt matching the sealed bundle. It records the existing delivery and removes retained payload without opening the composer, clicking Send, or requeuing. If any proof is missing, leave the job under manual review.
- `invalidate-orphaned-enqueue` closes only an audit-only enqueue that has no durable job/payload and no claim, submit, retry, failure, or completion event. It requires exact operator proof that stale media from another turn was attributed to a text-only inbound and that no external action occurred. It does not restore, send, or reuse the job. New schema-3 enqueue events include their schema version; production audit fails if one loses its durable job without a recognized terminal/invalidation event.
- Call `complete` immediately after verification so an external side effect is not left unrecorded.
- Continue sequentially after successful complete-bundle delivery. After a failed job is durably retained, continuation to a DIFFERENT pending job requires a full reload of the wrapper-owned tab and two observations of the exact group with an empty composer, no staged upload and no pending message bubble. Never clear an uncertain draft or replay that job to unlock continuation. Stop if clean state cannot be proved, reload/authentication fails, or three consecutive jobs fail. Each job is attempted at most once in the run, even if its backoff expires; other eligible jobs retain FIFO order.
- Always release the lock and disconnect only this CDP client. The wrapper closes only its owned tab; managed Chrome is not stopped. Recovery requeues only pre-Send work. A persisted Send marker or unproven completion is retained in `failed/`, never automatically replayed. Manual retry requires `confirmed_not_sent: true` plus a review reason.
- Lease creation, expiry takeover, status reads, and release use the queue metadata mutex so another worker cannot steal a partially written lease. Unreadable or invalid leases are retained and reported, not assumed expired. Startup/recovery or run-end audit failures release only that run's own lease; errors remain visible.
- Malformed or unreadable pending/processing/failed JSON is a queue error, never an empty queue or permission to enqueue a potential duplicate. Keep the damaged record for review. A file legitimately moved by another worker between directory listing and read may be skipped only on `ENOENT`.
- Verified crash recovery writes the matching completion audit event before removing its durable job, and retains that evidence if the audit write fails. Already-recorded completion events and sent metadata are reused rather than duplicated. Recovered uncertain jobs contribute to the manual-review notification; they must not disappear behind `NO_REPLY`. The production audit also flags unreadable/invalid JSONL events.

## Notification rules

Return exactly `NO_REPLY` when the queue is empty or another worker owns the lock. In that case the entire final response must be only those eight characters: no explanation, prefix, suffix, whitespace-only line, quote, or code fence. If 2-step verification is required, return only the exact notification sentence above. When work occurred, return one short summary such as `Messenger queue: 3 sent, 1 retry scheduled, 0 manual review required, 0 permanently failed. 1 pending remaining.` Include a safe pause reason when a clean context cannot be verified or repeated failures stop the run, and the total retained manual reviews when it exceeds this run's count. Pending/backoff work must not disappear behind NO_REPLY. An uncertain post-Send result increments `manual review required`, never `permanently failed`. A runner-level failure reports that the queue was retained instead of inventing a scheduled retry. Never expose message contents, contact identifiers, paths, auth data, or browser-session details in the summary.
